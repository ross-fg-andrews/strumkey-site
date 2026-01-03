import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useGroupSongs, useGroupMeetings } from '../db/queries';

export default function GroupPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('overview');
  
  const { data: songsData } = useGroupSongs(id);
  const { data: meetingsData } = useGroupMeetings(id);

  const songs = songsData?.songShares?.map(ss => ss.song).filter(Boolean) || [];
  const meetings = meetingsData?.meetings || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'songbooks', label: 'Songbooks' },
    { id: 'meetings', label: 'Meetings' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Group Name</h1>
        <p className="text-gray-600">Group description</p>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 px-4 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 font-semibold'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-lg mb-2">About</h2>
            <p className="text-gray-600">Group information goes here</p>
          </div>
        </div>
      )}

      {activeTab === 'songs' && (
        <div className="space-y-4">
          {songs.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              <p>No songs shared with this group yet.</p>
            </div>
          ) : (
            songs.map((song) => (
              <div key={song.id} className="card">
                <a
                  href={`/songs/${song.id}`}
                  className="text-lg font-semibold hover:text-primary-600"
                >
                  {song.title}
                </a>
                {song.artist && (
                  <p className="text-gray-600 text-sm">{song.artist}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'songbooks' && (
        <div className="card text-center py-8 text-gray-500">
          <p>Songbooks will appear here</p>
        </div>
      )}

      {activeTab === 'meetings' && (
        <div className="space-y-4">
          {meetings.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              <p>No meetings scheduled yet.</p>
            </div>
          ) : (
            meetings.map((meeting) => (
              <div key={meeting.id} className="card">
                <a
                  href={`/meetings/${meeting.id}`}
                  className="text-lg font-semibold hover:text-primary-600"
                >
                  {meeting.title}
                </a>
                <p className="text-gray-600 text-sm">
                  {new Date(meeting.date).toLocaleDateString()} at {meeting.time}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

