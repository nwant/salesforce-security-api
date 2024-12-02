const express = require('express');
const jsforce = require('jsforce');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Authenticate and get user details
const authenticateSalesforce = async () => {
  try {
    const conn = new jsforce.Connection({
      loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com'
    });

    // Combine password and security token if both are provided
    const password = process.env.SALESFORCE_PASSWORD + (process.env.SALESFORCE_TOKEN || '');

    await conn.login(
      process.env.SALESFORCE_USERNAME,
      password
    );
    return conn;
  } catch (error) {
    console.error('Salesforce Authentication Error:', error);
    throw error;
  }
};

// Get object and field level security for a user
app.get('/security-schema/:userId?', async (req, res) => {
  console.log('Received request for /security-schema with userId:', req.params.userId);
  try {
    // Authenticate with Salesforce
    console.log('Attempting to authenticate with Salesforce...');
    const conn = await authenticateSalesforce();
    console.log('Successfully authenticated with Salesforce, userInfo:', conn.userInfo);

    // Get the user ID from the parameter or use the authenticated user's ID
    const targetUserId = req.params.userId || conn.userInfo.id;
    console.log('Using targetUserId:', targetUserId);
    
    // If no user ID is available, return an error
    if (!targetUserId) {
      console.error('No user ID available');
      return res.status(400).json({ error: 'No user ID available' });
    }

    let userInfo;

    // If user ID is provided, verify the user exists
    try {
      console.log('Querying for user with ID:', targetUserId);
      const userQuery = await conn.query(`SELECT Id, Username FROM User WHERE Id = '${targetUserId}'`);
      console.log('User query result:', userQuery);
      if (!userQuery.records.length) {
        console.error('User not found with ID:', targetUserId);
        return res.status(404).json({ error: 'User not found' });
      }
      userInfo = userQuery.records[0];
    } catch (error) {
      console.error('Error querying user:', error);
      return res.status(500).json({ error: 'Failed to query user', details: error.message });
    }

    // First get the permission sets assigned to the user
    const permSetAssignments = await conn.query(
      `SELECT PermissionSetId 
       FROM PermissionSetAssignment 
       WHERE AssigneeId = '${targetUserId}'`
    );

    // Get the permission set IDs
    const permSetIds = permSetAssignments.records.map(record => `'${record.PermissionSetId}'`).join(',');

    // Fetch object and field permissions for these permission sets
    const objectPermissions = await conn.query(
      `SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete 
       FROM ObjectPermissions 
       WHERE ParentId IN (${permSetIds})`
    );

    const fieldPermissions = await conn.query(
      `SELECT SobjectType, Field, PermissionsRead, PermissionsEdit 
       FROM FieldPermissions 
       WHERE ParentId IN (${permSetIds})`
    );

    // Log raw data for debugging
    console.log('Raw data from Salesforce:');
    console.log('Object Permissions:', JSON.stringify(objectPermissions.records, null, 2));
    console.log('Field Permissions:', JSON.stringify(fieldPermissions.records, null, 2));

    // Map object permissions
    const objectsByType = {};
    objectPermissions.records.forEach(record => {
      const permissions = [];
      if (record.PermissionsCreate) permissions.push('c');
      if (record.PermissionsRead) permissions.push('r');
      if (record.PermissionsEdit) permissions.push('e');
      if (record.PermissionsDelete) permissions.push('d');
      
      if (!objectsByType[record.SobjectType]) {
        objectsByType[record.SobjectType] = {
          SobjectType: record.SobjectType,
          permissions: permissions,
          fieldPermissions: []
        };
      } else {
        objectsByType[record.SobjectType].permissions = [
          ...new Set([...objectsByType[record.SobjectType].permissions, ...permissions])
        ];
      }
    });

    // Organize field permissions by SObjectType
    const fieldPermissionsByObject = fieldPermissions.records.reduce((acc, field) => {
      // Extract object name from Field (e.g., "Account.Name" -> "Account")
      const objectName = field.SobjectType;
      
      if (!acc[objectName]) {
        acc[objectName] = [];
      }

      // Extract field name from Field (e.g., "Account.Name" -> "Name")
      const fieldName = field.Field.split('.')[1];
      
      // Map field permissions
      const permissions = [];
      if (field.PermissionsRead) permissions.push('r');
      if (field.PermissionsEdit) permissions.push('w');

      acc[objectName].push({
        field: fieldName,
        permissions
      });

      return acc;
    }, {});

    console.log('Field permissions by object:', JSON.stringify(fieldPermissionsByObject, null, 2));

    // Sort field permissions for each object
    Object.keys(fieldPermissionsByObject).forEach(sObjectType => {
      if (Array.isArray(fieldPermissionsByObject[sObjectType])) {
        fieldPermissionsByObject[sObjectType].sort((a, b) => {
          if (!a.field || !b.field) {
            console.warn('Found field permission with missing field name:', { a, b });
            return 0;
          }
          return a.field.localeCompare(b.field);
        });
      }
    });

    // Add field permissions to objects
    Object.keys(objectsByType).forEach(sObjectType => {
      objectsByType[sObjectType].fieldPermissions = fieldPermissionsByObject[sObjectType] || [];
    });

    console.log('Final objects with permissions:', JSON.stringify(Object.values(objectsByType), null, 2));

    // Sort objects by SObjectType
    const sortedObjects = Object.values(objectsByType).sort((a, b) => {
      if (!a.SobjectType || !b.SobjectType) {
        console.warn('Found object with missing SObjectType during sort:', { a, b });
        return 0;
      }
      return a.SobjectType.localeCompare(b.SobjectType);
    });

    // Log the final structure for debugging
    console.log('Final permissions structure:', JSON.stringify({
      objectCount: sortedObjects.length,
      objects: sortedObjects.map(obj => ({
        SobjectType: obj.SobjectType,
        fieldCount: obj.fieldPermissions.length
      }))
    }, null, 2));

    // Return the formatted response
    res.json({
      userId: targetUserId,
      permissions: sortedObjects.map(obj => ({
        SobjectType: obj.SobjectType,
        permissions: obj.permissions,
        fieldPermissions: obj.fieldPermissions
      }))
    });
  } catch (error) {
    console.error('Error retrieving security schema:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve security schema', 
      details: error.message 
    });
  }
});

// Check record access for multiple records
app.post('/record-access/:userId?', async (req, res) => {
  try {
    // Validate request body
    const { recordIds } = req.body;
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'recordIds must be a non-empty array'
      });
    }

    if (recordIds.length > 100) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Maximum of 100 records can be checked at once'
      });
    }

    // Authenticate with Salesforce
    const conn = await authenticateSalesforce();

    // Get the user ID from the parameter or use the authenticated user's ID
    let targetUserId = conn.userInfo.id;
    let userInfo;

    if (req.params.userId) {
      try {
        // If user ID is provided, verify the user exists
        const userQuery = await conn.query(`SELECT Id, Username FROM User WHERE Id = '${req.params.userId}'`);
        if (!userQuery.records.length) {
          return res.status(404).json({ error: 'User not found' });
        }
        targetUserId = req.params.userId;
        userInfo = userQuery.records[0];
      } catch (error) {
        console.error('Error querying user:', error);
        return res.status(400).json({ 
          error: 'Invalid user ID', 
          details: error.message 
        });
      }
    }

    // Group records by object type using describe
    const recordsByType = new Map();
    for (const recordId of recordIds) {
      const objectType = recordId.substring(0, 3);
      if (!recordsByType.has(objectType)) {
        recordsByType.set(objectType, []);
      }
      recordsByType.get(objectType).push(recordId);
    }

    // Get record access for each group of records
    const accessResults = {};
    for (const [objectType, typeRecordIds] of recordsByType) {
      // Query UserRecordAccess for all records of this type
      const query = `
        SELECT RecordId, HasReadAccess, HasEditAccess, HasDeleteAccess, HasTransferAccess, MaxAccessLevel
        FROM UserRecordAccess 
        WHERE UserId = '${targetUserId}'
        AND RecordId IN ('${typeRecordIds.join("','")}')
      `;
      
      const results = await conn.query(query);
      
      // Map results to permissions array format
      results.records.forEach(record => {
        const permissions = [];
        if (record.HasReadAccess) permissions.push('r');
        if (record.HasEditAccess) permissions.push('e');
        if (record.HasDeleteAccess) permissions.push('d');
        if (record.HasTransferAccess) permissions.push('t');

        accessResults[record.RecordId] = {
          objectType: objectType,
          permissions: permissions,
          maxAccess: permissions.length > 0 ? record.MaxAccessLevel : 'None'
        };
      });
    }

    // Add information for any records that weren't found
    recordIds.forEach(recordId => {
      if (!accessResults[recordId]) {
        accessResults[recordId] = {
          objectType: recordId.substring(0, 3),
          permissions: [],
          maxAccess: 'None'
        };
      }
    });

    res.json({
      userId: targetUserId,
      username: userInfo ? userInfo.Username : conn.userInfo.username,
      timestamp: new Date().toISOString(),
      results: accessResults
    });

  } catch (error) {
    console.error('Error checking record access:', error);
    res.status(500).json({
      error: 'Failed to check record access',
      details: error.message
    });
  }
});

// Start the server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
