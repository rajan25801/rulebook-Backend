const db = require('../db');

// Fetch all pending rules
exports.getPendingRules = async(ruleGroupId) => {
  try {
    const query = `
      SELECT * FROM rules
      WHERE rule_group_id = $1 AND status = 'PENDING';
    `;
    const values = [ruleGroupId];

    // Log the query and values for debugging
    console.log('Executing Query:', query);
    console.log('With Values:', values);

    const result = await db.query(query, values);
    return result.rows; // Return only the rows property
  } catch (error) {
    console.error('Error in getPendingRules service:', error);
    throw error;
  }
};

// Approve a rule
exports.approveRule = async(ruleGroupId, ruleId, approvedBy) => {
  try {
    const query = `
      UPDATE rules
      SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
      WHERE id = $2 AND rule_group_id = $3 AND status = 'PENDING'
      RETURNING *;
    `;
    const values = [approvedBy, ruleId, ruleGroupId];

    // Log the query and values for debugging
    console.log('Executing Query:', query);
    console.log('With Values:', values);

    const result = await db.query(query, values);
    return result.rows; // Return only the rows property
  } catch (error) {
    console.error('Error in approveRule service:', error);
    throw error;
  }
};

// Reject a rule
exports.rejectRule = async(ruleGroupId, ruleId, rejectedBy, rejectionReason) => {
  try {
    const query = `
      UPDATE rules
      SET status = 'REJECTED', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
      WHERE id = $3 AND rule_group_id = $4 AND status = 'PENDING'
      RETURNING *;
    `;
    const values = [rejectedBy, rejectionReason, ruleId, ruleGroupId];

    // Log the query and values for debugging
    console.log('Executing Query:', query);
    console.log('With Values:', values);

    const result = await db.query(query, values);
    return result.rows; // Return only the rows property
  } catch (error) {
    console.error('Error in rejectRule service:', error);
    throw error;
  }
};

// Fetch all approved rules
exports.getApprovedRules = async(ruleGroupId) => {
  try {
    const query = `
      SELECT * FROM rules
      WHERE rule_group_id = $1 AND status = 'APPROVED';
    `;
    const values = [ruleGroupId];

    // Log the query and values for debugging
    console.log('Executing Query:', query);
    console.log('With Values:', values);

    const result = await db.query(query, values);
    return result.rows; // Return only the rows property
  } catch (error) {
    console.error('Error in getApprovedRules service:', error);
    throw error;
  }
};

// Fetch all pending rules across all groups
exports.getAllPendingRules = async() => {
  try {
    const query = 'SELECT * FROM rules WHERE status = \'PENDING\';';
    console.log('Executing Query:', query);
    const result = await db.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error in getAllPendingRules service:', error);
    throw error;
  }
};

// Fetch all approved rules across all groups
exports.getAllApprovedRules = async() => {
  try {
    const query = 'SELECT * FROM rules WHERE status = \'APPROVED\';';
    console.log('Executing Query:', query);
    const result = await db.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error in getAllApprovedRules service:', error);
    throw error;
  }
};
