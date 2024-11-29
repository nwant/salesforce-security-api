const express = require('express');
const jsforce = require('jsforce');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Salesforce connection middleware
const createSalesforceConnection = () => {
  return new jsforce.Connection({
    loginUrl: process.env.SALESFORCE_LOGIN_URL
  });
};

// Authenticate and get user details
const authenticateSalesforce = async () => {
  const conn = createSalesforceConnection();
  try {
    await conn.login(
      process.env.SALESFORCE_USERNAME, 
      process.env.SALESFORCE_PASSWORD + process.env.SALESFORCE_TOKEN
    );
    return conn;
  } catch (error) {
    console.error('Salesforce Authentication Error:', error);
    throw error;
  }
};

// Get object and field level security for a user
app.get('/security-schema', async (req, res) => {
  try {
    // Authenticate with Salesforce
    const conn = await authenticateSalesforce();

    // Retrieve user details to get profile/permission set
    const userInfo = await conn.identity();

    // Fetch object and field permissions
    const objectPermissions = await conn.query(
      `SELECT SobjectType, PermissionsCreate, PermissionsDelete, PermissionsEdit, PermissionsRead 
       FROM ObjectPermissions 
       WHERE ParentId IN (
         SELECT PermissionSetId FROM PermissionSetAssignment 
         WHERE AssigneeId = '${userInfo.user_id}'
       )`
    );

    const fieldPermissions = await conn.query(
      `SELECT SobjectType, Field, PermissionsEdit, PermissionsRead 
       FROM FieldPermissions 
       WHERE ParentId IN (
         SELECT PermissionSetId FROM PermissionSetAssignment 
         WHERE AssigneeId = '${userInfo.user_id}'
       )`
    );

    console.log('Raw data from Salesforce:');
    console.log('Object Permissions count:', objectPermissions.records.length);
    console.log('Field Permissions count:', fieldPermissions.records.length);
    console.log('Sample Object Permission:', JSON.stringify(objectPermissions.records[0], null, 2));
    console.log('Sample Field Permission:', JSON.stringify(fieldPermissions.records[0], null, 2));

    // Organize field permissions by SObjectType
    const fieldPermissionsByObject = fieldPermissions.records.reduce((acc, field) => {
      // Skip if SObjectType is missing
      if (!field.SobjectType || !field.Field) {
        console.warn('Skipping field permission with missing data:', field);
        return acc;
      }

      // Only process fields that have at least one permission
      const permissions = [];
      if (field.PermissionsRead) permissions.push("r");
      if (field.PermissionsEdit) permissions.push("w");
      
      // Skip fields with no permissions
      if (permissions.length === 0) {
        console.log('Skipping field with no permissions:', field.Field);
        return acc;
      }

      if (!acc[field.SobjectType]) {
        acc[field.SobjectType] = [];
      }
      
      // Extract just the field name from the Field API name (remove Object prefix)
      const fieldName = field.Field.split('.')[1] || field.Field;
      
      acc[field.SobjectType].push({
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

    // Filter and transform object permissions
    const objectsWithPermissions = objectPermissions.records.reduce((acc, obj) => {
      // Skip if SObjectType is missing
      if (!obj.SobjectType) {
        console.warn('Skipping object permission with missing SObjectType:', obj);
        return acc;
      }

      const permissions = [];
      if (obj.PermissionsCreate) permissions.push("c");
      if (obj.PermissionsRead) permissions.push("r");
      if (obj.PermissionsEdit) permissions.push("e");
      if (obj.PermissionsDelete) permissions.push("d");

      // Skip objects with no permissions
      if (permissions.length === 0) {
        console.log('Skipping object with no permissions:', obj.SobjectType);
        return acc;
      }

      acc.push({
        SobjectType: obj.SobjectType,
        permissions,
        fieldPermissions: fieldPermissionsByObject[obj.SobjectType] || []
      });
      return acc;
    }, []);

    console.log('Final objects with permissions:', JSON.stringify(objectsWithPermissions, null, 2));

    // Sort objects by SObjectType
    objectsWithPermissions.sort((a, b) => {
      if (!a.SobjectType || !b.SobjectType) {
        console.warn('Found object with missing SObjectType during sort:', { a, b });
        return 0;
      }
      return a.SobjectType.localeCompare(b.SobjectType);
    });

    // Log the final structure for debugging
    console.log('Final permissions structure:', JSON.stringify({
      objectCount: objectsWithPermissions.length,
      objects: objectsWithPermissions.map(obj => ({
        SobjectType: obj.SobjectType,
        fieldCount: obj.fieldPermissions.length
      }))
    }, null, 2));

    res.json({
      userId: userInfo.user_id,
      username: userInfo.username,
      permissions: objectsWithPermissions
    });
  } catch (error) {
    console.error('Error retrieving security schema:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve security schema', 
      details: error.message 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Salesforce Security Microservice running on port ${PORT}`);
});

module.exports = app; // For testing purposes
