# Rule Book Backend: End-to-End Guide

This guide explains how to use the Rule Book Backend to create new rulesets, view active rules, and evaluate rules. It is written for both technical and non-technical users.

---

## Table of Contents
1. [Overview](#overview)
2. [Controllers & Endpoints](#controllers--endpoints)
   - [Rule Controller](#rule-controller)
3. [Example API Usage](#example-api-usage)
4. [FAQ](#faq)

---

## Overview

The Rule Book Backend is a Node.js/Express API for managing business rules. It allows you to:
- Define and store rulesets (collections of rules)
- View, update, and rollback rules
- Evaluate rulesets with input data
- Manage rule tags and parameters
- Fetch rule history and metadata

---

## Controllers & Endpoints

Handles all rule-related operations.

#### 1. Create Rule
- **POST** `/groups/:rule_group_id/rules`
- **Description:** Create a new rule in a rule group. Accepts rule details, parameters, and tags.
- **Body Example:**
  ```json
  {
    "name": "Age Check",
    "description": "Check if age is above 18",
    "json_rule": { "conditions": { "all": [{ "fact": "age", "operator": "greaterThanInclusive", "value": 18 }] } },
    "parameters": [{ "name": "age", "data_type": "NUMBER", "is_required": true }],
    "tags": [{ "name": "eligibility" }],
    "created_by": "admin"
  }
  ```
- **Response:** `{ "message": "Rule created successfully.", "rule_id": 1 }`

#### 2. Update Rule
- **PUT** `/groups/:rule_group_id/rules/:rule_id`
- **Description:** Update an existing rule. Supports updating rule logic, description, tags, parameters, and more.
- **Body Example:**
  ```json
  {
    "name": "Age Check Updated",
    "json_rule": { ... },
    "tags": [{ "name": "updated" }],
    "parameters": [{ "name": "age", "data_type": "NUMBER" }],
    "evaluated_by": 1
  }
  ```
- **Response:** Details of the updated rule and versioning info.

#### 3. Rollback Rule
- **POST** `/groups/:rule_group_id/rules/:rule_id/rollback`
- **Description:** Rollback a rule to its previous version.
- **Body Example:** `{ "evaluated_by": 1, "reason": "Incorrect logic" }`
- **Response:** Details of the rollback and the restored version.

#### 4. View Rule History
- **GET** `/groups/:rule_group_id/rules/:rule_id/history?version=2`
- **Description:** Fetches the event history for a rule, including all changes and rollbacks.
- **Response:** List of events with metadata.

#### 5. Evaluate Rule(s)
- **POST** `/groups/:rule_group_id/evaluate`
- **Description:** Evaluate rules in a group with provided input data.
- **Body Example:**
  ```json
  {
    "loanDetails": [{ "age": 25, "income": 40000 }]
  }
  ```
- **Response:** Evaluation results, matched rules, and trace IDs.

#### 6. Evaluate Rule with Dynamic Facts
- **POST** `/evaluate/dynamic`
- **Description:** Evaluate rules using dynamic facts (e.g., fetched from DB or API).
- **Body Example:**
  ```json
  {
    "rules": [ ... ],
    "facts": { ... }
  }
  ```
- **Response:** Events triggered by the evaluation.

#### 7. Get Rules (with filtering)
- **GET** `/groups/:rule_group_id/rules?page=1&limit=10&search=...&version=...`
- **Description:** List rules in a group, with pagination, search, and version filtering.
- **Response:** Paginated list of rules with parameters and tags.

#### 8. Get Rule by Version
- **GET** `/groups/:rule_group_id/rules/:rule_id/version/:version`
- **Description:** Fetch a specific version of a rule.
- **Response:** Rule details for the requested version.

#### 9. Toggle Rule (Enable/Disable)
- **POST** `/rules/:rule_id/toggle/:enabled`
- **Description:** Enable or disable a rule.
- **Response:** Status message.

#### 10. Get Rule Groups
- **GET** `/groups?page=1&limit=10&search=...`
- **Description:** List all rule groups.
- **Response:** Paginated list of rule groups.

#### 11. Fetch Path Data
- **POST** `/fetch-path-data`
- **Description:** Fetch and validate data from a fact using a JSONPath.
- **Body Example:** `{ "factName": "loanAdditionalInfos", "path": "$.PRE_PAYMENT_ENABLED" }`
- **Response:** Extracted data.

#### 12. Get Fact Names for Group
- **GET** `/groups/:rule_group_id/fact-names`
- **Description:** Get all unique fact names (parameter names) for a rule group.
- **Response:** List of fact names.

---


## Example API Usage

See the "Examples" section in the README for cURL commands and sample requests.

---

