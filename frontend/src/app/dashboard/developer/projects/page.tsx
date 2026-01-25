'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';

interface Project {
  id: string;
  title: string;
  description: string;
  budget: number;
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
}

export default function DeveloperProjectsPage() {
  const { address } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, [address]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      // TODO: Implement API endpoint to fetch developer's projects
      // const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/developers/${address}/projects`);
      // const data = await response.json();
      // setProjects(data);

      // Placeholder empty state for now
      setProjects([]);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    open: 'bg-blue-500',
    assigned: 'bg-purple-500',
    in_progress: 'bg-yellow-500',
    completed: 'bg-green-500',
    cancelled: 'bg-red-500',
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Projects</h1>
        <p className="text-gray-300">View and manage your assigned projects</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-white text-xl">Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-12 text-center">
          <div className="w-16 h-16 bg-purple-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Projects Yet</h3>
          <p className="text-gray-400 mb-6">
            You haven't been assigned to any projects yet. Check back later or browse available projects.
          </p>
          <Link
            href="/projects"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg transition-shadow"
          >
            Browse Projects
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-1">{project.title}</h3>
                  <p className="text-gray-400 text-sm">{project.description}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${statusColors[project.status]}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Budget</p>
                  <p className="text-white font-semibold">${project.budget} USDC</p>
                </div>
                <Link
                  href={`/projects/${project.id}`}
                  className="px-4 py-2 bg-purple-600 rounded-lg text-white font-medium hover:bg-purple-700 transition-colors"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
