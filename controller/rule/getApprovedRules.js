const ruleService = require('../../services/ruleService');

async function getApprovedRules(req, res) {
  try {
    const rule_group_id = req.params.rule_group_id;
    const { page = 1, limit = 20 } = req.query;
    let results;
    if (rule_group_id === 'all') {
      results = await ruleService.getAllApprovedRules();
    } else {
      results = await ruleService.getApprovedRules(rule_group_id);
    }
    const formattedResults = results.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      version: rule.version,
      ruleGroupId: rule.rule_group_id,
      ruleGroupName: rule.rule_group_name || `Group ${rule.rule_group_id}`,
      createdBy: rule.created_by,
      updatedBy: rule.updated_by,
      approvedBy: rule.approved_by,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
      approvedAt: rule.approved_at,
      priority: rule.priority || 3,
      tags: rule.tags || [],
      status: rule.status ? rule.status.toLowerCase() : undefined,
      ruleLogic: rule.json_rule ?
        typeof rule.json_rule === 'string' ?
          rule.json_rule : JSON.stringify(rule.json_rule, null, 2)
        : null
    }));
    return res.status(200).json({
      rules: formattedResults,
      total: formattedResults.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting approved rules:', error);
    return res.status(500).json({ error: 'Failed to fetch approved rules' });
  }
}

module.exports = { getApprovedRules };
