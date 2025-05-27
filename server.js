const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const projectMiddleware = require('./middlewares/projectMapper');
const bodyParser = require('body-parser');
const { login } = require('./controller/loginController');
const { authMiddleware } = require('./middlewares/authMiddleware');
const swaggerDocument = YAML.load('./swagger.yaml');
const {
  approveRule,
  createRule,
  evaluateRule,
  evaluateRuleWithDynamicFacts,
  fetchPathData,
  getAllApprovedRules,
  getAllPendingRules,
  getApprovedRules,
  getFactNamesForGroup,
  getPendingRules,
  getRuleByVersion,
  getRuleGroups,
  getRules,
  rejectRule,
  rollbackRule,
  saveDraftRule,
  storeRuleEvent,
  toggleRule,
  updateRule,
  viewHistory,
  evaluateRulePending
} = require('./controller/rule');

dotenv.config();
const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// Rule Management Endpoints
// app.post('/rule-engine/api/v1/groups/:rule_group_id/rules', authMiddleware, projectMiddleware, createRule);
app.put('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/update',projectMiddleware, updateRule);
app.post('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/rollback', projectMiddleware, rollbackRule);
app.post('/rule-engine/api/v1/groups/:rule_group_id/evaluations',  projectMiddleware, evaluateRule);
app.post('/rule-engine/api/v1/groups/:rule_group_id/evaluationPendingRules',  projectMiddleware, evaluateRulePending);

// app.post('/rule-engine/api/v1/groups/:rule_group_id/evaluate', projectMiddleware, evaluateRuleWithDynamicFacts);



// View history endpoints
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/history',  projectMiddleware, viewHistory);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/history',viewHistory);
app.get('/rule-engine/api/v1/groups/rules/history',  viewHistory);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/history/version/:version', projectMiddleware, viewHistory);

// Rules Query Endpoints
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules', getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/active', projectMiddleware, getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/latest',  projectMiddleware, getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/search',  projectMiddleware, getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/sort/:field/:order', projectMiddleware, getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/tags/:tag', projectMiddleware, getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/version/:version',  projectMiddleware, getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/filter', projectMiddleware, getRules);


// get list of rule groups
app.get('/rule-engine/api/v1/groups',getRuleGroups);

// Add route for fetching path data
app.post('/rule-engine/api/v1/fetch-path-data',  fetchPathData);

// Endpoint to get all unique fact names for a rule group
app.get('/rule-engine/api/v1/groups/:rule_group_id/facts', getFactNamesForGroup);

// Authentication route
app.post('/login', login);

// Checker 'all groups' endpoints for frontend
app.get('/rule-engine/api/v1/rules/pending', authMiddleware, getAllPendingRules);
app.get('/rule-engine/api/v1/rules/approved', authMiddleware, getAllApprovedRules);

// Protected routes (example)
app.use(authMiddleware);
app.get('/protected', (req, res) => {
  res.json({ message: `Hello, ${req.user.role}! You have access to this route.` });
});

// Updated to align with the latest exports in ruleController.js
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/pending', authMiddleware, projectMiddleware, getPendingRules);
app.post('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/approve', authMiddleware, projectMiddleware, approveRule);
app.post('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/reject', authMiddleware, projectMiddleware, rejectRule);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/approved', authMiddleware, projectMiddleware, getApprovedRules);



//draft routes
app.post('/rule-engine/api/v1/groups/:rule_group_id/drafts', projectMiddleware, saveDraftRule);
app.put('/rule-engine/api/v1/groups/:rule_group_id/drafts/:draft_id', projectMiddleware, saveDraftRule);

app.post('/rule-engine/api/v1/groups/:rule_group_id/submit/:draft_id',createRule);
const PORT = process.env.PORT || 3002;
app.listen(PORT,() => {
  console.log(`Server running at ${PORT}`);
  console.log(`Swagger UI is available at http://localhost:${PORT}/api-docs`);
});

