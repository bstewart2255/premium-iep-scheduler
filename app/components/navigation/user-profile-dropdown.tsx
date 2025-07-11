'use client';

import { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

interface Profile {
  full_name: string;
  role: string;
  school_district: string;
  school_site: string;
  email: string;
}

export default function UserProfileDropdown({ user }: { user: User }) {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data && !error) {
        setProfile(data);
      }
    };

    if (user) {
      fetchProfile();
    }
  }, [user, supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user.email?.[0].toUpperCase() || 'U';
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: { [key: string]: string } = {
      'resource': 'Resource Specialist',
      'speech': 'Speech Therapist',
      'ot': 'Occupational Therapist',
      'counseling': 'Counselor',
      'specialist': 'Program Specialist',
      'sea': 'Special Education Assistant'
    };
    return roleMap[role] || role;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label="User menu"
      >
        <span className="text-sm font-medium">{getInitials()}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
          {/* User Info Section */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-lg font-medium text-blue-600">{getInitials()}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {profile?.full_name || 'Loading...'}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Profile Details */}
          {profile && (
            <div className="px-4 py-3 space-y-3 border-b border-gray-200">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</p>
                <p className="mt-1 text-sm text-gray-900">{getRoleDisplay(profile.role)}</p>
                {profile.role === 'sea' && (
                  <p className="mt-1 text-xs text-green-600">Free access - no payment required</p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">School District</p>
                <p className="mt-1 text-sm text-gray-900">{profile.school_district}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">School Site</p>
                <p className="mt-1 text-sm text-gray-900">{profile.school_site}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-2 py-2 space-y-1">
            <button
              onClick={() => router.push('/dashboard/settings')}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Settings
            </button>
            {/* Only show billing link for non-SEA users */}
            {profile && profile.role !== 'sea' && (
              <button
                onClick={() => router.push('/billing')}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Billing & Subscription
              </button>
            )}
            <div className="border-t border-gray-200 my-1"></div>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}