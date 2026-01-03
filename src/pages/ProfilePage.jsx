import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Profile</h1>
      
      <div className="card max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <p className="text-gray-900">{user?.email || 'Not provided'}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <p className="text-gray-900">{user?.name || 'Not provided'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}


