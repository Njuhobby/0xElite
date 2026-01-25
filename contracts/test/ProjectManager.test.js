const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProjectManager", function () {
  let projectManager;
  let owner, client1, client2, developer1, developer2;

  beforeEach(async function () {
    [owner, client1, client2, developer1, developer2] = await ethers.getSigners();

    const ProjectManager = await ethers.getContractFactory("ProjectManager");
    projectManager = await ProjectManager.deploy(owner.address);
    await projectManager.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await projectManager.owner()).to.equal(owner.address);
    });

    it("Should initialize nextProjectId to 0", async function () {
      expect(await projectManager.nextProjectId()).to.equal(0);
    });

    it("Should initialize project count to 0", async function () {
      expect(await projectManager.getProjectCount()).to.equal(0);
    });
  });

  describe("Project Creation", function () {
    const validBudget = ethers.parseUnits("5000", 6); // 5000 USDC

    it("Should create a project with valid budget", async function () {
      const tx = await projectManager.connect(client1).createProject(validBudget);
      const receipt = await tx.wait();

      // Check event emission
      const event = receipt.logs.find(log => {
        try {
          return projectManager.interface.parseLog(log).name === "ProjectCreated";
        } catch (e) {
          return false;
        }
      });

      const parsedEvent = projectManager.interface.parseLog(event);
      expect(parsedEvent.args.projectId).to.equal(0);
      expect(parsedEvent.args.client).to.equal(client1.address);
      expect(parsedEvent.args.totalBudget).to.equal(validBudget);

      // Check project data
      const project = await projectManager.getProject(0);
      expect(project.projectId).to.equal(0);
      expect(project.client).to.equal(client1.address);
      expect(project.assignedDeveloper).to.equal(ethers.ZeroAddress);
      expect(project.state).to.equal(0); // Draft
      expect(project.totalBudget).to.equal(validBudget);
      expect(project.createdAt).to.be.gt(0);
      expect(project.activatedAt).to.equal(0);
      expect(project.completedAt).to.equal(0);
    });

    it("Should increment nextProjectId after creation", async function () {
      await projectManager.connect(client1).createProject(validBudget);
      expect(await projectManager.nextProjectId()).to.equal(1);

      await projectManager.connect(client2).createProject(validBudget);
      expect(await projectManager.nextProjectId()).to.equal(2);
    });

    it("Should increment project count correctly", async function () {
      expect(await projectManager.getProjectCount()).to.equal(0);

      await projectManager.connect(client1).createProject(validBudget);
      expect(await projectManager.getProjectCount()).to.equal(1);

      await projectManager.connect(client2).createProject(validBudget);
      expect(await projectManager.getProjectCount()).to.equal(2);
    });

    it("Should allow same client to create multiple projects", async function () {
      await projectManager.connect(client1).createProject(validBudget);
      await projectManager.connect(client1).createProject(ethers.parseUnits("3000", 6));

      const project0 = await projectManager.getProject(0);
      const project1 = await projectManager.getProject(1);

      expect(project0.client).to.equal(client1.address);
      expect(project1.client).to.equal(client1.address);
      expect(project0.totalBudget).to.equal(validBudget);
      expect(project1.totalBudget).to.equal(ethers.parseUnits("3000", 6));
    });

    it("Should reject project with zero budget", async function () {
      await expect(
        projectManager.connect(client1).createProject(0)
      ).to.be.revertedWith("Budget must be positive");
    });

    it("Should handle large budget amounts", async function () {
      const largeBudget = ethers.parseUnits("1000000", 6); // 1M USDC
      await projectManager.connect(client1).createProject(largeBudget);

      const project = await projectManager.getProject(0);
      expect(project.totalBudget).to.equal(largeBudget);
    });
  });

  describe("Developer Assignment", function () {
    const validBudget = ethers.parseUnits("5000", 6);

    beforeEach(async function () {
      // Create a project first
      await projectManager.connect(client1).createProject(validBudget);
    });

    it("Should assign developer to draft project", async function () {
      const tx = await projectManager.connect(owner).assignDeveloper(0, developer1.address);
      const receipt = await tx.wait();

      // Check DeveloperAssigned event
      const assignEvent = receipt.logs.find(log => {
        try {
          const parsed = projectManager.interface.parseLog(log);
          return parsed.name === "DeveloperAssigned";
        } catch (e) {
          return false;
        }
      });

      const parsedAssignEvent = projectManager.interface.parseLog(assignEvent);
      expect(parsedAssignEvent.args.projectId).to.equal(0);
      expect(parsedAssignEvent.args.developer).to.equal(developer1.address);

      // Check ProjectStateChanged event
      const stateEvent = receipt.logs.find(log => {
        try {
          const parsed = projectManager.interface.parseLog(log);
          return parsed.name === "ProjectStateChanged";
        } catch (e) {
          return false;
        }
      });

      const parsedStateEvent = projectManager.interface.parseLog(stateEvent);
      expect(parsedStateEvent.args.projectId).to.equal(0);
      expect(parsedStateEvent.args.oldState).to.equal(0); // Draft
      expect(parsedStateEvent.args.newState).to.equal(1); // Active

      // Check project data
      const project = await projectManager.getProject(0);
      expect(project.assignedDeveloper).to.equal(developer1.address);
      expect(project.state).to.equal(1); // Active
      expect(project.activatedAt).to.be.gt(0);
    });

    it("Should only allow owner to assign developers", async function () {
      await expect(
        projectManager.connect(client1).assignDeveloper(0, developer1.address)
      ).to.be.revertedWithCustomError(projectManager, "OwnableUnauthorizedAccount");

      await expect(
        projectManager.connect(developer1).assignDeveloper(0, developer1.address)
      ).to.be.revertedWithCustomError(projectManager, "OwnableUnauthorizedAccount");
    });

    it("Should reject assignment to non-existent project", async function () {
      await expect(
        projectManager.connect(owner).assignDeveloper(999, developer1.address)
      ).to.be.revertedWith("Project does not exist");
    });

    it("Should reject assignment with zero address", async function () {
      await expect(
        projectManager.connect(owner).assignDeveloper(0, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid developer address");
    });

    it("Should reject assignment to non-draft project", async function () {
      // Assign developer (moves to Active)
      await projectManager.connect(owner).assignDeveloper(0, developer1.address);

      // Try to assign again
      await expect(
        projectManager.connect(owner).assignDeveloper(0, developer2.address)
      ).to.be.revertedWith("Project not in draft state");
    });
  });

  describe("Project State Management", function () {
    const validBudget = ethers.parseUnits("5000", 6);

    beforeEach(async function () {
      // Create and activate a project
      await projectManager.connect(client1).createProject(validBudget);
      await projectManager.connect(owner).assignDeveloper(0, developer1.address);
    });

    it("Should update project state to Completed", async function () {
      const tx = await projectManager.connect(owner).updateProjectState(0, 2); // Completed
      const receipt = await tx.wait();

      // Check event
      const event = receipt.logs.find(log => {
        try {
          const parsed = projectManager.interface.parseLog(log);
          return parsed.name === "ProjectStateChanged";
        } catch (e) {
          return false;
        }
      });

      const parsedEvent = projectManager.interface.parseLog(event);
      expect(parsedEvent.args.projectId).to.equal(0);
      expect(parsedEvent.args.oldState).to.equal(1); // Active
      expect(parsedEvent.args.newState).to.equal(2); // Completed

      // Check project data
      const project = await projectManager.getProject(0);
      expect(project.state).to.equal(2); // Completed
      expect(project.completedAt).to.be.gt(0);
    });

    it("Should update project state to Disputed", async function () {
      await projectManager.connect(owner).updateProjectState(0, 3); // Disputed

      const project = await projectManager.getProject(0);
      expect(project.state).to.equal(3); // Disputed
    });

    it("Should update project state to Cancelled", async function () {
      await projectManager.connect(owner).updateProjectState(0, 4); // Cancelled

      const project = await projectManager.getProject(0);
      expect(project.state).to.equal(4); // Cancelled
    });

    it("Should only allow owner to update state", async function () {
      await expect(
        projectManager.connect(client1).updateProjectState(0, 2)
      ).to.be.revertedWithCustomError(projectManager, "OwnableUnauthorizedAccount");

      await expect(
        projectManager.connect(developer1).updateProjectState(0, 2)
      ).to.be.revertedWithCustomError(projectManager, "OwnableUnauthorizedAccount");
    });

    it("Should reject state update for non-existent project", async function () {
      await expect(
        projectManager.connect(owner).updateProjectState(999, 2)
      ).to.be.revertedWith("Project does not exist");
    });

    it("Should reject state update to same state", async function () {
      await expect(
        projectManager.connect(owner).updateProjectState(0, 1) // Already Active
      ).to.be.revertedWith("State unchanged");
    });

    it("Should allow state transition from Draft to Cancelled", async function () {
      // Create new draft project
      await projectManager.connect(client1).createProject(validBudget);

      await projectManager.connect(owner).updateProjectState(1, 4); // Cancelled

      const project = await projectManager.getProject(1);
      expect(project.state).to.equal(4); // Cancelled
    });
  });

  describe("View Functions", function () {
    const validBudget = ethers.parseUnits("5000", 6);

    beforeEach(async function () {
      await projectManager.connect(client1).createProject(validBudget);
      await projectManager.connect(owner).assignDeveloper(0, developer1.address);
    });

    it("Should return correct project data", async function () {
      const project = await projectManager.getProject(0);

      expect(project.projectId).to.equal(0);
      expect(project.client).to.equal(client1.address);
      expect(project.assignedDeveloper).to.equal(developer1.address);
      expect(project.state).to.equal(1); // Active
      expect(project.totalBudget).to.equal(validBudget);
    });

    it("Should correctly identify project client", async function () {
      expect(await projectManager.isProjectClient(0, client1.address)).to.be.true;
      expect(await projectManager.isProjectClient(0, client2.address)).to.be.false;
      expect(await projectManager.isProjectClient(0, developer1.address)).to.be.false;
    });

    it("Should correctly identify assigned developer", async function () {
      expect(await projectManager.isAssignedDeveloper(0, developer1.address)).to.be.true;
      expect(await projectManager.isAssignedDeveloper(0, developer2.address)).to.be.false;
      expect(await projectManager.isAssignedDeveloper(0, client1.address)).to.be.false;
    });

    it("Should revert when getting non-existent project", async function () {
      await expect(
        projectManager.getProject(999)
      ).to.be.revertedWith("Project does not exist");
    });

    it("Should return false for non-existent project client check", async function () {
      expect(await projectManager.isProjectClient(999, client1.address)).to.be.false;
    });

    it("Should return false for non-existent project developer check", async function () {
      expect(await projectManager.isAssignedDeveloper(999, developer1.address)).to.be.false;
    });
  });

  describe("Access Control", function () {
    const validBudget = ethers.parseUnits("5000", 6);

    it("Should allow ownership transfer", async function () {
      await projectManager.connect(owner).transferOwnership(client1.address);
      expect(await projectManager.owner()).to.equal(client1.address);
    });

    it("Should allow new owner to assign developers after transfer", async function () {
      await projectManager.connect(client1).createProject(validBudget);

      await projectManager.connect(owner).transferOwnership(client1.address);

      await expect(
        projectManager.connect(client1).assignDeveloper(0, developer1.address)
      ).to.not.be.reverted;
    });

    it("Should prevent old owner from assigning after transfer", async function () {
      await projectManager.connect(client1).createProject(validBudget);

      await projectManager.connect(owner).transferOwnership(client1.address);

      await expect(
        projectManager.connect(owner).assignDeveloper(0, developer1.address)
      ).to.be.revertedWithCustomError(projectManager, "OwnableUnauthorizedAccount");
    });
  });

  describe("Edge Cases", function () {
    const validBudget = ethers.parseUnits("5000", 6);

    it("Should handle rapid project creation", async function () {
      const projectPromises = [];
      for (let i = 0; i < 10; i++) {
        projectPromises.push(
          projectManager.connect(client1).createProject(validBudget)
        );
      }

      await Promise.all(projectPromises);
      expect(await projectManager.getProjectCount()).to.equal(10);
    });

    it("Should maintain separate project states", async function () {
      // Create 3 projects
      await projectManager.connect(client1).createProject(validBudget);
      await projectManager.connect(client1).createProject(validBudget);
      await projectManager.connect(client1).createProject(validBudget);

      // Assign developers to projects 0 and 2
      await projectManager.connect(owner).assignDeveloper(0, developer1.address);
      await projectManager.connect(owner).assignDeveloper(2, developer2.address);

      // Complete project 0
      await projectManager.connect(owner).updateProjectState(0, 2); // Completed

      // Check states
      const project0 = await projectManager.getProject(0);
      const project1 = await projectManager.getProject(1);
      const project2 = await projectManager.getProject(2);

      expect(project0.state).to.equal(2); // Completed
      expect(project1.state).to.equal(0); // Draft
      expect(project2.state).to.equal(1); // Active
    });

    it("Should handle minimum budget (1 unit)", async function () {
      await projectManager.connect(client1).createProject(1);

      const project = await projectManager.getProject(0);
      expect(project.totalBudget).to.equal(1);
    });

    it("Should handle maximum uint256 budget", async function () {
      const maxBudget = ethers.MaxUint256;
      await projectManager.connect(client1).createProject(maxBudget);

      const project = await projectManager.getProject(0);
      expect(project.totalBudget).to.equal(maxBudget);
    });
  });
});
