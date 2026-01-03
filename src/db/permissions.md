# InstantDB Permissions Reference

This file contains the permission rules that should be configured in your InstantDB dashboard.

## Note
InstantDB permissions are typically configured in the dashboard UI, not in code. This file serves as a reference for what permissions should be set up.

## Permission Rules

### Users
- **View**: Any authenticated user can view user profiles
- **Update**: Users can only update their own profile

### Groups
- **Create**: Any authenticated user can create a group
- **View**: Users can view groups they belong to (filtered in queries)
- **Update**: Only the group creator can update group details

### Group Members
- **Create**: Any authenticated user can request to join a group
- **View**: Users can see their own memberships; group creators can see all members
- **Update**: Only group creators can approve/change member status

### Songs
- **Create**: Any authenticated user can create songs
- **View**: Users can view songs they created OR songs shared with their groups
- **Update**: Users can only update songs they created
- **Delete**: Users can only delete songs they created (if not in songbooks)

### Song Shares
- **Create**: Group members can share songs with their groups
- **View**: Group members can see shares for their groups
- **Delete**: Song creator or group admins can remove shares

### Songbooks
- **Create**: Any authenticated user can create songbooks
- **View**: Users can view their own songbooks OR group songbooks for groups they belong to
- **Update**: Users can update their own songbooks OR group songbooks (if admin)
- **Delete**: Same as update permissions

### Songbook Songs
- **Create/Update/Delete**: Same permissions as parent songbook

### Meetings
- **Create**: Only group admins can create meetings
- **View**: Group members can view meetings for their groups
- **Update**: Only group admins can update meetings
- **Delete**: Only group admins can delete meetings

### Meeting RSVPs
- **Create**: Group members can RSVP to meetings in their groups
- **View**: Group members can view RSVPs for their group meetings
- **Update**: Users can only update their own RSVPs
- **Delete**: Users can only delete their own RSVPs

### Chords
- **View**: All authenticated users can view chords
- **Create/Update/Delete**: System-managed (no user permissions)

## Implementation Notes

1. Many permission checks are handled at the query level (filtering results)
2. Some permissions require checking relationships (e.g., "is user an admin of this group?")
3. Deletion permissions may have additional business logic (e.g., "can't delete if referenced")

See `src/utils/deletion-helpers.js` for deletion validation logic.

