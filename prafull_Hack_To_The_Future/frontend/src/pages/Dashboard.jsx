import React, { createContext, useContext, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

// Create a context for solved problems count
export const SolvedProblemsContext = createContext();

export const SolvedProblemsProvider = ({ children }) => {
  const [solvedCount, setSolvedCount] = useState(0);

  const incrementSolvedCount = () => {
    setSolvedCount((prev) => prev + 1);
  };

  return (
    <SolvedProblemsContext.Provider
      value={{ solvedCount, incrementSolvedCount }}
    >
      {children}
    </SolvedProblemsContext.Provider>
  );
};

export const useSolvedProblems = () => useContext(SolvedProblemsContext);

const Dashboard = () => {
  const { user, loading } = useAuth();
  const { solvedCount } = useSolvedProblems();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Profile Header */}
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Profile Information
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Your personal details and progress.
            </p>
          </div>

          {/* Profile Content */}
          <div className="px-4 py-5 sm:p-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Username</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.username}</dd>
              </div>

              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">
                  Email address
                </dt>
                <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
              </div>

              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">
                  Skill Level
                </dt>
                <dd className="mt-1 text-sm text-gray-900 capitalize">
                  {user.skillLevel}
                </dd>
              </div>

              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">
                  Account created
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(user.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Stats Section */}
          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Your Progress
            </h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="bg-blue-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <dt className="text-sm font-medium text-blue-600 truncate">
                    Total Problems Solved
                  </dt>
                  <dd className="mt-1 text-3xl font-semibold text-blue-900">
                    {solvedCount}
                  </dd>
                </div>
              </div>

              <div className="bg-green-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <dt className="text-sm font-medium text-green-600 truncate">
                    Current Skill Level
                  </dt>
                  <dd className="mt-1 text-3xl font-semibold text-green-900 capitalize">
                    {user.skillLevel}
                  </dd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
