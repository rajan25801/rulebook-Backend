const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const projectMiddleware = require('./middlewares/projectMapper');
const ruleController = require('./controller/ruleController');

const swaggerDocument = YAML.load('./swagger.yaml');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Rule Management Endpoints
app.post('/rule-engine/api/v1/groups/:rule_group_id/rules', projectMiddleware, ruleController.createRule);
app.put('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/update', projectMiddleware, ruleController.updateRule);
app.post('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/rollback', projectMiddleware, ruleController.rollbackRule);
app.post('/rule-engine/api/v1/groups/:rule_group_id/evaluations', projectMiddleware, ruleController.evaluateRule);
// app.post('/rule-engine/api/v1/groups/:rule_group_id/evaluate', projectMiddleware, ruleController.evaluateRuleWithDynamicFacts);



// View history endpoints
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/history', projectMiddleware, ruleController.viewHistory);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/history', ruleController.viewHistory);
app.get('/rule-engine/api/v1/groups/rules/history', ruleController.viewHistory);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/:rule_id/history/version/:version', projectMiddleware, ruleController.viewHistory);

// Rules Query Endpoints
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules', ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/active', projectMiddleware, ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/latest', projectMiddleware, ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/search', projectMiddleware, ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/sort/:field/:order', projectMiddleware, ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/tags/:tag', projectMiddleware, ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/version/:version', projectMiddleware, ruleController.getRules);
app.get('/rule-engine/api/v1/groups/:rule_group_id/rules/filter', projectMiddleware, ruleController.getRules);


// get list of rule groups
app.get('/rule-engine/api/v1/groups', ruleController.getRuleGroups);

// Add route for fetching path data
app.post('/rule-engine/api/v1/fetch-path-data', ruleController.fetchPathData);

// Endpoint to get all unique fact names for a rule group
app.get('/rule-engine/api/v1/groups/:rule_group_id/facts', ruleController.getFactNamesForGroup);

const PORT = process.env.PORT || 3002;
app.listen(PORT,() => {
    console.log(`Server running at ${PORT}`);
    console.log(`Swagger UI is available at http://localhost:${PORT}/api-docs`);
});

