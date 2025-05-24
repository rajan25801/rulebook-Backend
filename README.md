# Rule Book Backend: End-to-End Guide

This guide explains how to use the Rule Book Backend to create new rulesets, view active rules, and evaluate rules. It is written for both technical and non-technical users.

---

## Table of Contents
1. [Overview](#overview)
2. [Creating a New Ruleset](#creating-a-new-ruleset)
3. [Viewing Active Rules](#viewing-active-rules)
4. [Evaluating Rules](#evaluating-rules)
5. [API Reference](#api-reference)
6. [Examples](#examples)
7. [FAQ](#faq)

---

## Overview

The Rule Book Backend is a Node.js/Express API for managing business rules. It allows you to:
- Define and store rulesets (collections of rules)
- View all active rules
- Evaluate rulesets with input data

---

## Creating a New Ruleset

A **ruleset** is a group of rules that define decision logic. You can create a ruleset using the API or via a connected UI.

### Using the API

**Endpoint:** `POST /rulesets`

**Request Body Example:**
```json
{
  "name": "Credit Card Eligibility",
  "description": "Rules for checking credit card eligibility",
  "rules": [
    {
      "name": "Age Check",
      "condition": "age >= 18",
      "parameters": ["age"]
    },
    {
      "name": "Income Check",
      "condition": "income >= 30000",
      "parameters": ["income"]
    }
  ]
}
```

**How to do it:**
1. Use a tool like Postman or cURL to send a POST request to `/rulesets` with the above JSON.
2. The backend will save your ruleset and return a confirmation.

*Non-technical users can use the Rule Book UI to fill out a form and submit new rulesets without writing JSON.*

---

## Viewing Active Rules

You can view all active rulesets and their rules.

**Endpoint:** `GET /rulesets`

**How to do it:**
1. Send a GET request to `/rulesets`.
2. The response will be a list of all rulesets, each with its rules and status.

*In the UI, navigate to the "Active Rules" section to see all current rules.*

---

## Evaluating Rules

You can test a ruleset by evaluating it with sample data.

**Endpoint:** `POST /rulesets/:id/evaluate`

**Request Body Example:**
```json
{
  "age": 25,
  "income": 40000
}
```

**How to do it:**
1. Find the ID of the ruleset you want to evaluate (from the `/rulesets` list).
2. Send a POST request to `/rulesets/{id}/evaluate` with your input data.
3. The backend will return the evaluation result, showing which rules passed or failed.

*In the UI, use the "Evaluate Rule" feature to select a ruleset and enter test data.*

---

## API Reference

- `POST /rulesets` — Create a new ruleset
- `GET /rulesets` — List all rulesets
- `GET /rulesets/:id` — Get details of a specific ruleset
- `POST /rulesets/:id/evaluate` — Evaluate a ruleset with input data

---

## Examples

### Example: Creating a Ruleset (cURL)
```bash
curl -X POST http://localhost:3000/rulesets \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Credit Card Eligibility",
    "description": "Rules for checking credit card eligibility",
    "rules": [
      {"name": "Age Check", "condition": "age >= 18", "parameters": ["age"]},
      {"name": "Income Check", "condition": "income >= 30000", "parameters": ["income"]}
    ]
  }'
```

### Example: Evaluating a Ruleset (cURL)
```bash
curl -X POST http://localhost:3000/rulesets/{id}/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"age": 25, "income": 40000}'
```

---

## FAQ

**Q: Do I need to know programming to use the backend?**
A: No. You can use the Rule Book UI for all actions. The API is for advanced/technical users.

**Q: Can I edit or delete rules?**
A: Yes. Use the appropriate API endpoints or the UI.

**Q: How do I know if my rules are working?**
A: Use the evaluation endpoint or the UI's "Evaluate Rule" feature to test with sample data.

---

For more help, contact your technical team or check the project documentation.
