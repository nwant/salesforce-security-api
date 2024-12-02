# Salesforce Security Microservice

A Node.js microservice that retrieves permissions for a Salesforce user.

## Features

- Retrieves object and field-level permissions for the authenticated user
- Permissions are organized hierarchically with fields nested under their parent objects
- Simplified permission codes for easy interpretation
- Alphabetically sorted results for consistent responses
- Check access permissions for multiple Salesforce records

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file with your Salesforce credentials:
```env
SALESFORCE_USERNAME=your_username
SALESFORCE_PASSWORD=your_password
SALESFORCE_TOKEN=your_security_token
SALESFORCE_LOGIN_URL=https://login.salesforce.com
PORT=3000
```

## Usage

### Starting the Server

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### API Endpoints

#### GET /security-schema[/:userId]

Retrieves the security schema for a Salesforce user. If no user ID is provided, returns permissions for the authenticated user.

**Parameters:**
- `userId` (optional): The Salesforce User ID to retrieve permissions for

**Response Format:**
```json
{
  "userId": "005...",
  "username": "user@example.com",
  "permissions": [
    {
      "SobjectType": "Account",
      "permissions": ["c", "r", "e", "d"],
      "fieldPermissions": [
        {
          "field": "Name",
          "permissions": ["r", "w"]
        },
        {
          "field": "Industry",
          "permissions": ["r"]
        }
      ]
    }
  ]
}
```

#### POST /record-access[/:userId]

Check access permissions for multiple Salesforce records. Returns detailed access information for each record. If no user ID is provided, returns permissions for the authenticated user.

**Parameters:**
- `userId` (optional): The Salesforce User ID to check permissions for

**Request Body:**
```json
{
  "recordIds": [
    "001xx000003DGb2AAG",
    "003xx000004TK8hAAG"
  ]
}
```

**Response Format:**
```json
{
  "userId": "005xx000001234AAA",
  "username": "user@example.com",
  "timestamp": "2024-01-20T10:30:45.123Z",
  "results": {
    "001xx000003DGb2AAG": {
      "objectType": "001",
      "permissions": ["r", "e"],
      "maxAccess": "Edit"
    },
    "003xx000004TK8hAAG": {
      "objectType": "003",
      "permissions": [],
      "maxAccess": "None"
    }
  }
}
```

**Request Limits:**
- Maximum of 100 record IDs per request
- Records must be valid 15 or 18-character Salesforce IDs

**Permission Codes:**

Object Permissions (security-schema):
- `c`: Create
- `r`: Read
- `e`: Edit
- `d`: Delete

Field Permissions (security-schema):
- `r`: Read
- `w`: Write

Record Permissions (record-access):
- `r`: Read
- `e`: Edit
- `d`: Delete
- `t`: Transfer

**Access Levels:**
- `None`: No access to the record
- `Read`: Read-only access
- `Edit`: Can modify the record
- `All`: Full access including transfer rights

**Error Responses:**
- `404 Not Found`: User ID does not exist
- `400 Bad Request`: Invalid user ID format or invalid request body
- `401 Unauthorized`: Authentication failed
- `500 Internal Server Error`: Server error

**Notes:**
- Objects and fields are only included if the user has at least one permission
- Results are sorted alphabetically by SObject type and field name
- Field names are returned without the object prefix (e.g., "Name" instead of "Account.Name")

## Development

The service uses:
- Express.js for the web server
- JSForce for Salesforce API integration
- Nodemon for development auto-restart

### Postman Collection

The `/postman` directory contains files for testing the API:

1. Import the collection:
   - `postman/salesforce-security-api.postman_collection.json`

2. Import the environment:
   - `postman/salesforce-security-api.postman_environment.json`

3. Update environment variables:
   - `baseUrl`: API base URL (default: http://localhost:3000)
   - `testUserId`: Sample Salesforce User ID for testing
   - `testRecordId1` and `testRecordId2`: Sample record IDs for testing

The collection includes requests for all available endpoints with example payloads.

## Testing

The service includes comprehensive tests using Jest and Supertest. Mock Salesforce API responses are handled using Nock.

### Running Tests

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

### Test Coverage Requirements

The project maintains a minimum of 80% test coverage across:
- Branches
- Functions
- Lines
- Statements

### Test Structure

Tests are organized to cover:
- Authentication flows
- Permission retrieval for authenticated user
- Permission retrieval for specific user ID
- Error handling scenarios
- Response format validation

## Error Handling

The service includes comprehensive error handling:
- Authentication errors return 401
- Server errors return 500 with error details
- Missing or invalid permissions are filtered out automatically

## License

ISC
