'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import ProjectStatusBadge from '@/components/project/ProjectStatusBadge';

interface Project {
  id: string;
  projectNumber: number;
  title: string;
  requiredSkills: string[];
  totalBudget: string;
  status: string;
  assignedDeveloper: string | null;
  createdAt: string;
}

export default function ProjectsPage() {
  const { address } = useAccount();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    status: 'all',
    skills: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  useEffect(() => {
    fetchProjects();
  }, [filters]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.skills) params.append('skills', filters.skills);
      params.append('sortBy', filters.sortBy);
      params.append('sortOrder', filters.sortOrder);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await response.json();
      setProjects(data.projects);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Browse Projects</h1>
            <p className="text-gray-400">Explore active projects on the 0xElite platform</p>
          </div>
          <Link
            href="/projects/create"
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg transition-all"
          >
            + Create Project
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Projects</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="disputed">Disputed</option>
              </select>
            </div>

            {/* Skills Filter */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Filter by Skills</label>
              <input
                type="text"
                value={filters.skills}
                onChange={(e) => setFilters({ ...filters, skills: e.target.value })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="e.g., React,Solidity"
              />
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Sort By</label>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="created_at">Date Created</option>
                <option value="total_budget">Budget</option>
                <option value="project_number">Project Number</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-gray-300 font-medium mb-2">Order</label>
              <select
                value={filters.sortOrder}
                onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-white text-xl">Loading projects...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-xl p-6 mb-8">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Projects List */}
        {!loading && !error && (
          <div className="space-y-4">
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-xl mb-4">No projects found</p>
                <Link
                  href="/projects/create"
                  className="inline-block px-6 py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700"
                >
                  Create the first project
                </Link>
              </div>
            ) : (
              projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 hover:bg-white/10 transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-gray-400 font-mono text-sm">#{project.projectNumber}</span>
                          <ProjectStatusBadge status={project.status} />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">{project.title}</h2>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-white mb-1">
                          ${parseFloat(project.totalBudget).toFixed(0)}
                        </p>
                        <p className="text-gray-400 text-sm">USDC</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {project.requiredSkills.map((skill: string) => (
                        <span
                          key={skill}
                          className="px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-300 text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        {project.assignedDeveloper && (
                          <span className="text-gray-400">
                            Developer: <span className="text-white font-mono">{project.assignedDeveloper.slice(0, 6)}...{project.assignedDeveloper.slice(-4)}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
