import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { verifySignature } from '../../utils/signature';
import { logger } from '../../utils/logger';
import { assignDeveloperToProject } from '../../services/matchingAlgorithm';

const router = express.Router();

// Database and contract instances (injected via middleware)
let db: Pool;
let projectManagerContract: ethers.Contract;

export function initialize(database: Pool, contract: ethers.Contract) {
  db = database;
  projectManagerContract = contract;
}

// =====================================================
// VALIDATION HELPERS
// =====================================================

interface ValidationError {
  field: string;
  message: string;
}

function validateCreateProject(data: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.address || typeof data.address !== 'string') {
    errors.push({ field: 'address', message: 'Valid wallet address required' });
  }

  if (!data.message || typeof data.message !== 'string') {
    errors.push({ field: 'message', message: 'Signed message required' });
  }

  if (!data.signature || typeof data.signature !== 'string') {
    errors.push({ field: 'signature', message: 'Signature required' });
  }

  if (!data.title || typeof data.title !== 'string' || data.title.length > 200) {
    errors.push({ field: 'title', message: 'Title required (max 200 characters)' });
  }

  if (!data.description || typeof data.description !== 'string') {
    errors.push({ field: 'description', message: 'Description required' });
  }

  if (!Array.isArray(data.requiredSkills) || data.requiredSkills.length === 0 || data.requiredSkills.length > 10) {
    errors.push({ field: 'requiredSkills', message: 'Required skills must be array of 1-10 skills' });
  }

  if (!data.totalBudget || typeof data.totalBudget !== 'number' || data.totalBudget < 100) {
    errors.push({ field: 'totalBudget', message: 'Total budget must be at least 100 USDC' });
  }

  if (!Array.isArray(data.milestones) || data.milestones.length === 0) {
    errors.push({ field: 'milestones', message: 'At least one milestone required' });
  } else {
    // Validate milestone budgets sum to total
    const milestoneBudgetSum = data.milestones.reduce((sum: number, m: any) => sum + (m.budget || 0), 0);
    if (Math.abs(milestoneBudgetSum - data.totalBudget) > 0.01) {
      errors.push({
        field: 'milestones',
        message: `Milestone budgets must sum to total project budget. Expected: ${data.totalBudget}, Got: ${milestoneBudgetSum}`
      });
    }

    // Validate each milestone
    data.milestones.forEach((milestone: any, index: number) => {
      if (!milestone.title || milestone.title.length > 200) {
        errors.push({ field: `milestones[${index}].title`, message: 'Milestone title required (max 200 chars)' });
      }
      if (!milestone.description) {
        errors.push({ field: `milestones[${index}].description`, message: 'Milestone description required' });
      }
      if (!Array.isArray(milestone.deliverables) || milestone.deliverables.length === 0) {
        errors.push({ field: `milestones[${index}].deliverables`, message: 'At least one deliverable required' });
      }
      if (!milestone.budget || milestone.budget <= 0) {
        errors.push({ field: `milestones[${index}].budget`, message: 'Milestone budget must be positive' });
      }
    });
  }

  return errors;
}

// =====================================================
// POST /api/projects - Create Project
// =====================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const validationErrors = validateCreateProject(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationErrors,
      });
    }

    const { address, message, signature, title, description, requiredSkills, totalBudget, milestones } = req.body;

    // Verify signature
    const isValidSignature = verifySignature(message, signature, address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const clientAddress = address.toLowerCase();

    // Ensure client record exists (create minimal if needed)
    await db.query(
      `INSERT INTO clients (wallet_address)
       VALUES ($1)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [clientAddress]
    );

    // Update client projects_created counter
    await db.query(
      `UPDATE clients
       SET projects_created = projects_created + 1,
           updated_at = NOW()
       WHERE wallet_address = $1`,
      [clientAddress]
    );

    // Create project on blockchain first
    const budgetInBaseUnits = ethers.parseUnits(totalBudget.toString(), 6); // USDC has 6 decimals
    const tx = await projectManagerContract.createProject(budgetInBaseUnits);
    const receipt = await tx.wait();

    // Extract project ID from event
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = projectManagerContract.interface.parseLog(log);
        return parsed?.name === 'ProjectCreated';
      } catch (e) {
        return false;
      }
    });

    const parsedEvent = projectManagerContract.interface.parseLog(event);
    const contractProjectId = parsedEvent.args.projectId;

    logger.info('Project created on-chain', {
      contractProjectId: contractProjectId.toString(),
      client: clientAddress,
      txHash: receipt.hash,
    });

    // Create project in database
    const projectResult = await db.query(
      `INSERT INTO projects (
        client_address, title, description, required_skills, total_budget,
        status, contract_project_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, NOW(), NOW())
      RETURNING *`,
      [clientAddress, title, description, JSON.stringify(requiredSkills), totalBudget, contractProjectId.toString()]
    );

    const project = projectResult.rows[0];

    // Create milestones
    const createdMilestones = [];
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const milestoneResult = await db.query(
        `INSERT INTO milestones (
          project_id, milestone_number, title, description, deliverables, budget,
          status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
        RETURNING *`,
        [
          project.id,
          i + 1,
          milestone.title,
          milestone.description,
          JSON.stringify(milestone.deliverables),
          milestone.budget
        ]
      );
      createdMilestones.push(milestoneResult.rows[0]);
    }

    // Trigger auto-assignment
    logger.info('Triggering auto-assignment for project', { projectId: project.id });
    const assignedDeveloper = await assignDeveloperToProject(db, projectManagerContract, project.id);

    const assignmentPending = assignedDeveloper === null;

    res.status(201).json({
      id: project.id,
      projectNumber: project.project_number,
      clientAddress: project.client_address,
      title: project.title,
      description: project.description,
      requiredSkills: project.required_skills,
      totalBudget: project.total_budget,
      status: assignmentPending ? 'draft' : 'active',
      assignedDeveloper,
      assignmentPending,
      milestones: createdMilestones.map((m: any) => ({
        id: m.id,
        milestoneNumber: m.milestone_number,
        title: m.title,
        description: m.description,
        deliverables: m.deliverables,
        budget: m.budget,
        status: m.status,
      })),
      createdAt: project.created_at,
      message: assignmentPending
        ? 'Project created successfully. Searching for available developers...'
        : 'Project created and developer assigned successfully!',
    });
  } catch (error: any) {
    logger.error('Error creating project', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to create project',
    });
  }
});

// =====================================================
// GET /api/projects/:id - View Project
// =====================================================

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const viewerAddress = req.headers['x-wallet-address'] as string | undefined;

    const projectResult = await db.query(
      `SELECT p.*, c.company_name, c.email as client_email
       FROM projects p
       LEFT JOIN clients c ON p.client_address = c.wallet_address
       WHERE p.id = $1`,
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const project = projectResult.rows[0];
    const isOwner = viewerAddress?.toLowerCase() === project.client_address;
    const isAssignedDev = viewerAddress?.toLowerCase() === project.assigned_developer;

    // Fetch milestones
    const milestonesResult = await db.query(
      `SELECT * FROM milestones WHERE project_id = $1 ORDER BY milestone_number ASC`,
      [id]
    );

    // Fetch developer info if assigned
    let developerInfo = null;
    if (project.assigned_developer) {
      const devResult = await db.query(
        `SELECT wallet_address, github_username, skills, email
         FROM developers
         WHERE wallet_address = $1`,
        [project.assigned_developer]
      );

      if (devResult.rows.length > 0) {
        const dev = devResult.rows[0];
        developerInfo = {
          address: dev.wallet_address,
          githubUsername: dev.github_username,
          skills: dev.skills,
        };

        // Include email for client or assigned developer
        if (isOwner || isAssignedDev) {
          developerInfo.email = dev.email;
        }
      }
    }

    // Public view (default)
    if (!isOwner && !isAssignedDev) {
      return res.json({
        id: project.id,
        projectNumber: project.project_number,
        title: project.title,
        description: project.description,
        requiredSkills: project.required_skills,
        totalBudget: project.total_budget,
        status: project.status,
        assignedDeveloper: developerInfo,
        milestonesCompleted: milestonesResult.rows.filter((m: any) => m.status === 'completed').length,
        milestonesTotal: milestonesResult.rows.length,
        createdAt: project.created_at,
        startedAt: project.started_at,
      });
    }

    // Owner or assigned developer view (full details)
    res.json({
      id: project.id,
      projectNumber: project.project_number,
      clientAddress: project.client_address,
      companyName: project.company_name,
      clientEmail: isOwner || isAssignedDev ? project.client_email : undefined,
      title: project.title,
      description: project.description,
      requiredSkills: project.required_skills,
      totalBudget: project.total_budget,
      status: project.status,
      assignedDeveloper: developerInfo,
      milestones: milestonesResult.rows.map((m: any) => ({
        id: m.id,
        milestoneNumber: m.milestone_number,
        title: m.title,
        description: m.description,
        deliverables: m.deliverables,
        budget: m.budget,
        status: m.status,
        startedAt: m.started_at,
        submittedAt: m.submitted_at,
        completedAt: m.completed_at,
        deliverableUrls: m.deliverable_urls,
        reviewNotes: m.review_notes,
      })),
      createdAt: project.created_at,
      assignedAt: project.assigned_at,
      startedAt: project.started_at,
      completedAt: project.completed_at,
    });
  } catch (error: any) {
    logger.error('Error fetching project', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch project',
    });
  }
});

// =====================================================
// PUT /api/projects/:id - Update Project (Draft Only)
// =====================================================

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { address, message, signature, title, description, requiredSkills } = req.body;

    if (!address || !message || !signature) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Address, message, and signature required',
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(message, signature, address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    // Fetch project
    const projectResult = await db.query('SELECT * FROM projects WHERE id = $1', [id]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const project = projectResult.rows[0];

    // Check ownership
    if (project.client_address !== address.toLowerCase()) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only project owner can update project',
      });
    }

    // Check status
    if (project.status !== 'draft') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Cannot edit project in '${project.status}' status. Only draft projects can be edited.`,
      });
    }

    // Update project
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (title) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (requiredSkills) {
      updates.push(`required_skills = $${paramCount++}`);
      values.push(JSON.stringify(requiredSkills));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'No fields to update',
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await db.query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    res.json({
      id,
      title: title || project.title,
      updatedAt: new Date(),
    });
  } catch (error: any) {
    logger.error('Error updating project', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to update project',
    });
  }
});

// =====================================================
// GET /api/projects - List Projects
// =====================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status = 'all',
      clientAddress,
      developerAddress,
      skills,
      limit = '20',
      offset = '0',
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offsetNum = parseInt(offset as string) || 0;

    // Build query
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (status !== 'all') {
      conditions.push(`p.status = $${paramCount++}`);
      values.push(status);
    }

    if (clientAddress) {
      conditions.push(`p.client_address = $${paramCount++}`);
      values.push((clientAddress as string).toLowerCase());
    }

    if (developerAddress) {
      conditions.push(`p.assigned_developer = $${paramCount++}`);
      values.push((developerAddress as string).toLowerCase());
    }

    if (skills) {
      const skillArray = (skills as string).split(',');
      conditions.push(`p.required_skills ?| $${paramCount++}`);
      values.push(skillArray);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const validSortFields = ['created_at', 'total_budget', 'project_number'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM projects p ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get projects
    values.push(limitNum, offsetNum);
    const projectsResult = await db.query(
      `SELECT p.id, p.project_number, p.title, p.required_skills, p.total_budget,
              p.status, p.assigned_developer, p.created_at
       FROM projects p
       ${whereClause}
       ORDER BY p.${sortField} ${order}
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    res.json({
      projects: projectsResult.rows.map((p: any) => ({
        id: p.id,
        projectNumber: p.project_number,
        title: p.title,
        requiredSkills: p.required_skills,
        totalBudget: p.total_budget,
        status: p.status,
        assignedDeveloper: p.assigned_developer,
        createdAt: p.created_at,
      })),
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error: any) {
    logger.error('Error listing projects', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to list projects',
    });
  }
});

export default router;
