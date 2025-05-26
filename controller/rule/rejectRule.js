const db = require('../../db');
const ruleService = require('../../services/ruleService');

async function rejectRule(req, res) {
  try {
    const { rule_group_id, rule_id } = req.params;
    const { reason, comments } = req.body;

    // Validate required parameters
    if (!rule_group_id || !rule_id) {
      return res.status(400).json({ error: 'Missing rule_group_id or rule_id' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Use the service to reject the rule
    const rejectedBy = req.user?.username || 'system';
    const result = await ruleService.rejectRule(rule_group_id, rule_id, rejectedBy, reason);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Rule not found or already approved/rejected' });
    }

    // Format the response
    const rejectedRule = {
      id: result[0].id,
      name: result[0].name,
      description: result[0].description,
      status: result[0].status,
      rejectedBy: result[0].rejected_by,
      rejectedAt: result[0].rejected_at,
      rejectionReason: result[0].rejection_reason,
      ruleGroupId: result[0].rule_group_id
    };

    return res.status(200).json({
      message: 'Rule rejected successfully',
      rule: rejectedRule
    });
  } catch (error) {
    console.error('Error rejecting rule:', error);
    return res.status(500).json({ error: 'Failed to reject rule' });
  }
}

module.exports = { rejectRule };
