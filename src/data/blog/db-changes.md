---
pubDatetime: 2021-10-18
title: Adding RBAC to an Existing Internal Management System - A Database Design Approach
category: backend
draft: false
image: /og-images/articles/database-design.jpg
tags:
  - backend
  - database
  - design
  - permissions
  - RBAC
description: How we enhanced our existing internal management system with role-based access control (RBAC) - complete database schema design for managing permissions across Engineering, Product, Marketing, and Finance teams.
---

![Cover Image](/og-images/articles/database-design.jpg)

## Introduction

We had an internal management system (Admin Panel) for basic employee information, but it lacked proper access control. Everyone had the same level of access, which created security concerns as different teams—Engineering, Product, Marketing, Finance—needed different permissions.

This article documents how we added RBAC (Role-Based Access Control) to our existing system. We'll cover the database schema changes needed to implement group-based permissions, audit logging, and self-service access management.

---

## Problem Statement

Our internal admin panel had basic employee data management, but lacked granular access control. Everyone with panel access could see and modify everything—a major security and compliance issue.

**Key Pain Points:**
- No permission system—everyone had full access
- Manual tracking of who should access what
- Zero audit trail for permission changes
- Security risks as the organization grew
- Difficulty managing access for different teams (Engineering, Product, Marketing, Finance)
- No way to revoke access quickly when someone left

**What We Need to Add:**
- Role-based access control (RBAC) system
- Group-based permission management
- Module-level read/write controls
- Complete audit trail for all changes
- Self-service portal for users to view their access
- Quick access revocation mechanism

---

## Project Scope

### Database Changes

We're adding seven new tables to our existing admin panel to support RBAC:

**Existing Tables (already in system):**
- `panel_users` - Core user authentication and identity (will be enhanced)
- `employees` - Detailed employee information (already exists)

**New Tables to Add:**
1. `employee_logs` - Complete audit trail for permission changes
2. `user_groups` - Permission group definitions (Engineering, Product, Marketing, etc.)
3. `permissions` - Granular permission specifications per module
4. `group_permissions` - Mapping of permissions to groups
5. `user_group_permissions` - Mapping of users to groups

### Application Changes

**New Admin Features:**
- Dashboard showing user permissions and access history
- Permission group management interface
- Audit log viewer

**New User-Level Features:**
- Self-service portal to view assigned permissions
- Employee directory with access controls
- Transparent view of "who has access to what"

---

## System Architecture Overview

Our internal admin panel uses a group-based RBAC (Role-Based Access Control) model:

```
User → belongs to → Groups → have → Permissions → on → Modules
```

**How it works:**
- Users are assigned to groups (e.g., "Marketing Team", "Product Team", "Engineering Team")
- Each group has specific permissions
- Permissions define read/write access to different modules in the admin panel
- Adding/removing a user from a group instantly updates their access

---

## Database Schema Design

### Table 1: `panel_users` (Existing - Enhanced)

**Purpose:** Core identity and authentication for all system users.

This table already exists in our admin panel. We're adding a `status` field to enable instant access revocation as part of the RBAC implementation. This table is separate from `employees` because not all users are employees (we also have partners, contractors, etc.).

| Column Name           | Type     | Description                                                                                     |
| ---                   | ---      | ---                                                                                             |
| id                    | bigint   | Unique identifier (Primary Key)                                                                 |
| first_name            | String   | User's first name                                                                               |
| last_name             | String   | User's last name                                                                                |
| email                 | String   | Email address (unique, indexed)                                                                 |
| last_login_timestamp  | DateTime | When the user last accessed the panel                                                           |
| user_type             | String   | User category: `employee` or `partner`                                                          |
| status                | Int      | Access flag: `1` = active access, `0` = revoked (immediate lockout)                            |

**Key Design Decisions:**
- `status` field enables instant access revocation across all systems
- `user_type` allows different permission models for employees vs partners
- `last_login_timestamp` helps identify stale accounts for security audits

---

### Table 2: `employees` (Existing)

**Purpose:** Detailed employment information beyond basic authentication.

This table already exists in our admin panel. While `panel_users` handles authentication, this table stores employment details like team, position, and contact information.

| Column Name    | Type   | Description                                                                                   |
| ---            | ---    | ---                                                                                           |
| employee_id    | bigint | Unique identifier (Primary Key, Foreign Key to `panel_users.id`)                             |
| work_email     | String | Official work email (must end with company domain e.g., `@company.com`)                      |
| personal_email | String | Personal email for important communications                                                   |
| mobile_number  | String | Contact number                                                                                |
| team           | String | Team/department (e.g., "Engineering", "Finance", "Marketing")                                |
| position       | String | Job title (e.g., "Senior Software Engineer", "Tech Lead", "Product Manager")                |

**Key Design Decisions:**
- Separate work and personal emails (work email changes when someone leaves, personal doesn't)
- `team` and `position` enable organizational charts and reporting
- `employee_id` links directly to `panel_users` (1:1 relationship)

---

### Table 3: `employee_logs` (New - RBAC Addition)

**Purpose:** Complete audit trail of all employee-related changes, especially permissions.

This is a new table we're adding as part of RBAC. Every modification to employee data or permissions gets logged here with before/after snapshots. Critical for compliance, security audits, and answering "who gave this person admin access?"

| Column Name    | Type     | Description                                                |
| ---            | ---      | ---                                                        |
| id             | BigInt   | Unique log entry identifier (Primary Key)                  |
| employee_id    | BigInt   | Employee who was modified (Foreign Key)                    |
| module         | Enum     | Which part of the system was changed                       |
| created_at     | DateTime | When the change occurred                                   |
| previous_state | JSON     | Complete state before the change                           |
| current_state  | JSON     | Complete state after the change                            |

**Key Design Decisions:**
- JSON fields store flexible state snapshots (can capture any data structure)
- `module` enum categorizes changes (e.g., "profile", "permissions", "group_membership")
- Immutable table—rows are never updated or deleted, only inserted

**Example Log Entry:**
```json
{
  "id": 12345,
  "employee_id": 101,
  "module": "permissions",
  "created_at": "2024-10-15T14:30:00Z",
  "previous_state": {"groups": ["engineering"]},
  "current_state": {"groups": ["engineering", "leadership"]}
}
```

---

### Table 4: `user_groups` (New - RBAC Addition)

**Purpose:** Define reusable permission groups for different teams.

This is the core of our RBAC implementation. Instead of assigning permissions to individual users, we create groups representing teams—"Engineering Team", "Product Team", "Marketing Team"—and assign permissions to those groups.

| Column Name | Type   | Description        |
| ---         | ---    | ---                |
| id          | BigInt | Unique identifier (Primary Key)  |
| name        | String | Human-readable group name (unique, e.g., "Engineering Team")  |

**Example Groups in our admin panel:**
- `Engineering Team` - Access to technical modules and deployment tools
- `Product Team` - Access to product analytics and user data
- `Marketing Team` - Access to campaigns, analytics, and content management
- `Finance Team` - Access to financial reports and accounting modules
- `Admins` - Full access to all modules

**Key Design Decisions:**
- Simple structure—just ID and name
- All complexity lives in the permission mappings

---

### Table 5: `permissions` (New - RBAC Addition)

**Purpose:** Define granular permissions for each module in the admin panel.

This new table predefines all available permissions in our system. With 10 modules in the admin panel and read/write access for each, that's 20 base permissions. Add two global permissions (`all_read`, `all_write`) for admins, totaling 22 permissions.

| Column Name | Type     | Description                                     |
| ---         | ---      | ---                                             |
| id          | BigInt   | Unique identifier (Primary Key)                 |
| module_name | String   | Module this permission applies to               |
| read        | Boolean  | Read access to this module (default: false)     |
| write       | Boolean  | Write access to this module (default: false)    |

**Permission Examples:**

| id  | module_name    | read  | write | Description                                    |
| --- | -------------- | ----- | ----- | ---------------------------------------------- |
| 1   | user_management| true  | false | Can view users, cannot modify                  |
| 2   | user_management| true  | true  | Can view and modify users                      |
| 3   | finance        | true  | false | Can view financial data, cannot edit           |
| 4   | finance        | true  | true  | Full access to financial data                  |
| 21  | all_modules    | true  | false | Read-only access to everything (super viewer)  |
| 22  | all_modules    | true  | true  | God mode (use sparingly!)                      |

**Key Design Decisions:**
- Permissions are predefined, not user-created (prevents permission sprawl)
- Read/write flags enable granular control
- Special `all_modules` permissions for admin roles
- When adding a new module, just insert two new rows (read and write)

**Scalability:**
- Currently: 10 modules × 2 permissions + 2 global = 22 total
- Adding a module: Just insert 2 new permission rows
- System automatically recognizes and enforces them

---

### Table 6: `group_permissions` (New - RBAC Addition)

**Purpose:** Map permissions to groups (many-to-many relationship).

This junction table connects groups to permissions. For example, the "Marketing Team" group gets permissions for marketing analytics, campaigns, and user data modules.

| Column Name   | Type   | Description                                        |
| ---           | ---    | ---                                                |
| group_id      | bigint | Foreign Key to `user_groups.id`                    |
| permission_id | bigint | Foreign Key to `permissions.id`                    |

**Example Mapping:**

| group_id | permission_id | Meaning                                          |
| -------- | ------------- | ------------------------------------------------ |
| 1        | 1             | "Marketing Team" can view user data              |
| 2        | 3             | "Product Team" can view analytics                |
| 2        | 4             | "Product Team" can edit product modules          |
| 3        | 8             | "Engineering Team" has deployment access         |
| 5        | 22            | "Admins" have full read/write access             |

**Key Design Decisions:**
- Composite primary key (group_id + permission_id)
- No duplicate entries possible
- Deleting a row = instantly removing that permission from the group

---

### Table 7: `user_group_permissions` (New - RBAC Addition)

**Purpose:** Map users to groups (many-to-many relationship).

The final piece of our RBAC implementation. This table assigns panel users to groups, completing the permission chain: User → Group → Permissions → Modules.

| Column Name | Type   | Description                               |
| ---         | ---    | ---                                       |
| user_id     | bigint | Foreign Key to `panel_users.id`           |
| group_id    | bigint | Foreign Key to `user_groups.id`           |

**Example Mapping:**

| user_id | group_id | Meaning                                          |
| ------- | -------- | ------------------------------------------------ |
| 101     | 1        | User #101 is in "Marketing Team"                 |
| 102     | 2        | User #102 is in "Product Team"                   |
| 103     | 3        | User #103 is in "Engineering Team"               |
| 104     | 5        | User #104 is in "Admins" group                   |

**Key Design Decisions:**
- Users can belong to multiple groups (real-world people wear multiple hats)
- Adding a user to a group = instant access to all group permissions
- Removing a user from a group = instant revocation of all group permissions
- Composite primary key (user_id + group_id)

---

## Application Features

### For Administrators: Permission Management Dashboard

**Dashboard View:**
- List all users with their groups and effective permissions
- See "Access Given By" (who added them to groups) via `employee_logs`
- View "Module Access Given" by querying group memberships
- Quickly grant/revoke access by modifying `user_group_permissions`

**Group Management Interface:**
- Create new groups
- Assign permissions to groups
- View all users in a group
- Audit group permission changes

---

## Key Takeaways

### 1. **Group-Based RBAC Scales**
Instead of assigning permissions to individual users, we use groups. When someone from Marketing joins, add them to the "Marketing Team" group—done.

### 2. **Audit Everything**
The `employee_logs` table tracks every change with before/after state. Essential for debugging and compliance.

### 3. **Status Flag for Quick Revocation**
The `panel_users.status` flag enables instant access revocation. One SQL UPDATE locks a user out of the entire admin panel.

### 4. **Separate Identity from Employee Data**
Not everyone with admin panel access is an employee (partners, contractors). Separate tables keep the schema clean.

### 5. **JSON for Flexibility**
Using JSON for audit log state means we can track any change without schema migrations.

---

## Conclusion

By adding these five new tables (plus enhancing existing ones), we successfully implemented RBAC in our existing admin panel. Now different teams—Engineering, Product, Marketing, Finance—have appropriate access levels, and we maintain complete audit trails.

**The RBAC Architecture in One Sentence:**

> Users belong to Groups, which have Permissions, granting Read/Write access to specific Panel Modules, with every change logged for auditing.

**What We Achieved:**
- ✅ Granular access control across 10+ panel modules
- ✅ Group-based permission management (easy to onboard new team members)
- ✅ Complete audit trail for compliance
- ✅ Instant access revocation capability
- ✅ Self-service portal for employees to view their access

The addition of RBAC transformed our admin panel from an "everyone has full access" system to a secure, compliant internal management platform.


