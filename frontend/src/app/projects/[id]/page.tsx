'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useParams } from 'next/navigation';
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge';
import MilestoneCard from '@/components/project/MilestoneCard';

interface Milestone {
  id: string;
  milestoneNumber: number;
  title: string;
  description: string;
  deliverables: string[];
  budget: string;
  status: string;
  startedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  deliverableUrls?: string[];
  reviewNotes?: string;
}

interface Project {
  id: string;
  projectNumber: number;
  clientAddress: string;
  companyName?: string;
  clientEmail?: string;
  title: string;
  description: string;
  requiredSkills: string[];
  totalBudget: string;
  status: string;
  assignedDeveloper?: {
    address: string;
    githubUsername: string;
    skills: string[];
    email?: string;
  };
  milestones: Milestone[];
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export default function ProjectDetailPage() {
  const { address: connectedAddress } = useAccount();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isClient = connectedAddress?.toLowerCase() === project?.clientAddress.toLowerCase();
  const isDeveloper = connectedAddress?.toLowerCase() === project?.assignedDeveloper?.address.toLowerCase();

  useEffect(() => {
    fetchProject();
  }, [projectId, connectedAddress]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const headers: HeadersInit = {};
      if (connectedAddress) {
        headers['X-Wallet-Address'] = connectedAddress;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects/${projectId}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error('Project not found');
      }

      const data = await response.json();
      setProject(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] flex items-center justify-center">
        <div className="text-white text-xl">Loading project...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Project Not Found</h1>
          <p className="text-gray-400">{error || 'This project does not exist'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-gray-400 font-mono text-sm">#{project.projectNumber}</span>
                <ProjectStatusBadge status={project.status} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">{project.title}</h1>
              <p className="text-gray-300">{project.description}</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-white mb-1">
                ${parseFloat(project.totalBudget).toFixed(0)}
              </p>
              <p className="text-gray-400">USDC Total</p>
            </div>
          </div>

          {/* Skills */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Required Skills</h3>
            <div className="flex flex-wrap gap-2">
              {project.requiredSkills.map((skill: string) => (
                <span
                  key={skill}
                  className="px-4 py-2 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-300 font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Client Info */}
          <div className="border-t border-white/10 pt-6">
            <h3 className="text-white font-semibold mb-3">Client Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Wallet Address</p>
                <p className="text-white font-mono">{project.clientAddress}</p>
              </div>
              {project.companyName && (
                <div>
                  <p className="text-gray-400 text-sm">Company</p>
                  <p className="text-white">{project.companyName}</p>
                </div>
              )}
              {(isClient || isDeveloper) && project.clientEmail && (
                <div>
                  <p className="text-gray-400 text-sm">Email</p>
                  <p className="text-white">{project.clientEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Developer Info */}
          {project.assignedDeveloper && (
            <div className="border-t border-white/10 pt-6 mt-6">
              <h3 className="text-white font-semibold mb-3">Assigned Developer</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Wallet Address</p>
                  <p className="text-white font-mono">{project.assignedDeveloper.address}</p>
                </div>
                {project.assignedDeveloper.githubUsername && (
                  <div>
                    <p className="text-gray-400 text-sm">GitHub</p>
                    <a
                      href={`https://github.com/${project.assignedDeveloper.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300"
                    >
                      @{project.assignedDeveloper.githubUsername}
                    </a>
                  </div>
                )}
                {(isClient || isDeveloper) && project.assignedDeveloper.email && (
                  <div>
                    <p className="text-gray-400 text-sm">Email</p>
                    <p className="text-white">{project.assignedDeveloper.email}</p>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <p className="text-gray-400 text-sm mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {project.assignedDeveloper.skills.map((skill: string) => (
                    <span
                      key={skill}
                      className="px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-300 text-sm"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t border-white/10 pt-6 mt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-400 mb-1">Created</p>
                <p className="text-white">{new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
              {project.assignedAt && (
                <div>
                  <p className="text-gray-400 mb-1">Assigned</p>
                  <p className="text-white">{new Date(project.assignedAt).toLocaleDateString()}</p>
                </div>
              )}
              {project.startedAt && (
                <div>
                  <p className="text-gray-400 mb-1">Started</p>
                  <p className="text-white">{new Date(project.startedAt).toLocaleDateString()}</p>
                </div>
              )}
              {project.completedAt && (
                <div>
                  <p className="text-gray-400 mb-1">Completed</p>
                  <p className="text-white">{new Date(project.completedAt).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Project Milestones</h2>
          <div className="space-y-4">
            {project.milestones && project.milestones.length > 0 ? (
              project.milestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  isClient={isClient}
                  isDeveloper={isDeveloper}
                  onUpdate={fetchProject}
                />
              ))
            ) : (
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-8 text-center">
                <p className="text-gray-400">No milestones defined for this project</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
