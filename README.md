# Salesforce Security Microservice

A Node.js microservice that retrieves permissions for a Salesforce user.

## Features

- Retrieves object and field-level permissions for the authenticated user
- Permissions are organized hierarchically with fields nested under their parent objects
- Simplified permission codes for easy interpretation
- Alphabetically sorted results for consistent responses

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

**Permission Codes:**

Object Permissions:
- `c`: Create
- `r`: Read
- `e`: Edit
- `d`: Delete

Field Permissions:
- `r`: Read
- `w`: Write

**Error Responses:**
- `404 Not Found`: User ID does not exist
- `400 Bad Request`: Invalid user ID format
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

## Error Handling

The service includes comprehensive error handling:
- Authentication errors return 401
- Server errors return 500 with error details
- Missing or invalid permissions are filtered out automatically

## License

ISC
