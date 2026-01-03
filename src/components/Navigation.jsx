import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMyGroups } from '../db/queries';

export default function Navigation() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data } = useMyGroups(user?.id);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const groups = data?.groupMembers?.map(gm => gm.group) || [];

  return (
    <nav>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/home" className="text-2xl font-bold text-primary-600">
            Ukelio
          </Link>

          <div className="flex items-center gap-4">
            {/* Groups Dropdown */}
            {groups.length > 0 && (
              <div className="relative group">
                <button className="btn btn-secondary">
                  Groups ({groups.length})
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <div className="py-2">
                    {groups.map((group) => (
                      <Link
                        key={group.id}
                        to={`/groups/${group.id}`}
                        className="block px-4 py-2 hover:bg-gray-100"
                      >
                        {group.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* User Menu */}
            <div className="relative group">
              <button className="w-10 h-10 rounded-full flex items-center justify-center">
                {user?.imageURL ? (
                  <img 
                    src={user.imageURL} 
                    alt="User avatar" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-6 w-6 text-gray-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
                    />
                  </svg>
                )}
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="py-2">
                  <Link
                    to="/profile"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Profile
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

