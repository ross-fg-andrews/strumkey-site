import { useParams } from 'react-router-dom';
import { useMeeting } from '../db/queries';
import { useAuth } from '../contexts/AuthContext';
import { upsertRSVP } from '../db/mutations';
import { useState } from 'react';

export default function MeetingPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data } = useMeeting(id);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  const meeting = data?.meetings?.[0];
  const rsvps = meeting?.meetingRSVPs || [];
  const userRsvp = rsvps.find(r => r.userId === user?.id);

  const handleRSVP = async (response) => {
    setRsvpLoading(true);
    try {
      await upsertRSVP({
        meetingId: id,
        userId: user.id,
        response,
        existingRsvpId: userRsvp?.id,
      });
    } catch (error) {
      console.error('Error updating RSVP:', error);
      alert('Error updating RSVP. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
  };

  if (!meeting) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Loading meeting...</p>
      </div>
    );
  }

  const rsvpGroups = {
    yes: rsvps.filter(r => r.response === 'yes'),
    no: rsvps.filter(r => r.response === 'no'),
    maybe: rsvps.filter(r => r.response === 'maybe'),
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="heading-alice mb-2">{meeting.title}</h1>
        {meeting.description && (
          <p className="text-gray-600 mb-4">{meeting.description}</p>
        )}
        <div className="text-gray-700 space-y-1">
          <p>
            <strong>Date:</strong> {new Date(meeting.date).toLocaleDateString()}
          </p>
          <p>
            <strong>Time:</strong> {meeting.time}
          </p>
          {meeting.location && (
            <p>
              <strong>Location:</strong> {meeting.location}
            </p>
          )}
        </div>
      </div>

      {/* RSVP Section */}
      <div className="card mb-6">
        <h2 className="font-semibold text-lg mb-4">RSVP</h2>
        <div className="flex gap-4">
          <button
            onClick={() => handleRSVP('yes')}
            disabled={rsvpLoading}
            className={`btn ${
              userRsvp?.response === 'yes' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => handleRSVP('maybe')}
            disabled={rsvpLoading}
            className={`btn ${
              userRsvp?.response === 'maybe' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Maybe
          </button>
          <button
            onClick={() => handleRSVP('no')}
            disabled={rsvpLoading}
            className={`btn ${
              userRsvp?.response === 'no' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            No
          </button>
        </div>
      </div>

      {/* Attendees */}
      <div className="card mb-6">
        <h2 className="font-semibold text-lg mb-4">Attendees</h2>
        <div className="space-y-4">
          {rsvpGroups.yes.length > 0 && (
            <div>
              <h3 className="font-medium text-green-600 mb-2">
                Coming ({rsvpGroups.yes.length})
              </h3>
              <div className="space-y-1">
                {rsvpGroups.yes.map((rsvp) => (
                  <p key={rsvp.id} className="text-gray-700">
                    {rsvp.user?.name || rsvp.user?.email || 'Unknown'}
                  </p>
                ))}
              </div>
            </div>
          )}
          {rsvpGroups.maybe.length > 0 && (
            <div>
              <h3 className="font-medium text-yellow-600 mb-2">
                Maybe ({rsvpGroups.maybe.length})
              </h3>
              <div className="space-y-1">
                {rsvpGroups.maybe.map((rsvp) => (
                  <p key={rsvp.id} className="text-gray-700">
                    {rsvp.user?.name || rsvp.user?.email || 'Unknown'}
                  </p>
                ))}
              </div>
            </div>
          )}
          {rsvpGroups.no.length > 0 && (
            <div>
              <h3 className="font-medium text-red-600 mb-2">
                Not Coming ({rsvpGroups.no.length})
              </h3>
              <div className="space-y-1">
                {rsvpGroups.no.map((rsvp) => (
                  <p key={rsvp.id} className="text-gray-700">
                    {rsvp.user?.name || rsvp.user?.email || 'Unknown'}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Songbook */}
      {meeting.songbook && (
        <div className="card">
          <h2 className="font-semibold text-lg mb-4">Songbook</h2>
          <a
            href={`/songbooks/${meeting.songbook.id}`}
            className="text-primary-600 hover:underline"
          >
            View Songbook: {meeting.songbook.title}
          </a>
        </div>
      )}
    </div>
  );
}

