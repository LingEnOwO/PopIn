# PopIn - OSU Student Events App

A mobile event discovery and management platform for OSU students, built with Expo and Supabase.

## 🎯 Overview

PopIn helps OSU students discover, create, and join campus events. The app features email OTP authentication (restricted to @osu.edu emails), event browsing with filters, event creation, and feedback submission.

## 🏗️ Tech Stack

- **Mobile**: Expo (React Native) + TypeScript
- **Navigation**: Expo Router
- **Styling**: NativeWind (Tailwind CSS)
- **Backend**: Supabase (Auth, Database, RLS)
- **Auth**: Email OTP via Supabase Auth
- **Package Manager**: pnpm workspaces

## 📁 Project Structure

```
PopIn/
├── apps/
│   └── mobile/                 # Expo mobile app
│       ├── app/                # Expo Router screens
│       │   ├── (app)/          # Authenticated screens
│       │   │   ├── _layout.tsx
│       │   │   ├── feed.tsx
│       │   │   ├── create.tsx
│       │   │   ├── my-events.tsx
│       │   │   ├── feedback.tsx
│       │   │   └── event/[id].tsx
│       │   ├── _layout.tsx     # Root layout with auth guard
│       │   └── index.tsx       # Auth screen
│       ├── components/         # Reusable components
│       │   ├── Button.tsx
│       │   ├── Card.tsx
│       │   └── EventCard.tsx
│       └── lib/                # Utilities
│           ├── supabase.ts
│           └── database.types.ts
├── packages/
│   └── shared/                 # Shared types and constants
│       └── src/
│           ├── types.ts
│           └── index.ts
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Expo Go app (for mobile testing)
- Supabase account

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from the API settings
3. Navigate to the SQL Editor in your Supabase dashboard
4. Copy and run the entire contents of `supabase/migrations/001_initial_schema.sql`
5. Verify all tables were created (profiles, events, event_members, feedback)

### 2. Configure Email Authentication

In your Supabase dashboard:

1. Go to **Authentication** > **Providers**
2. Enable **Email** provider
3. Under **Email Auth**, ensure:
   - "Enable Email Provider" is checked
   - "Confirm Email" is **unchecked** (for OTP flow)
4. Configure email templates (optional but recommended):
   - Go to **Authentication** > **Email Templates**
   - Customize the "Magic Link" template for OTP codes

### 3. Install Dependencies

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install all dependencies
pnpm install
```

### 4. Configure Environment Variables

```bash
cd apps/mobile
cp .env.example .env
```

Edit `apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Run the App

```bash
# From the root directory
pnpm mobile

# Or from apps/mobile directory
cd apps/mobile
pnpm start
```

Scan the QR code with:

- **iOS**: Camera app or Expo Go
- **Android**: Expo Go app

## 📱 Features

### ✅ Authentication

- Email OTP sign-in
- Restricted to @osu.edu email addresses
- Automatic profile creation on first login

### ✅ Event Feed

- Browse upcoming active events
- Filter by:
  - All Events
  - Next 3 Hours
  - Today
- Pull to refresh
- View event details

### ✅ Event Details

- Full event information
- Join/leave events
- Capacity tracking
- Host information
- Real-time attendee count

### ✅ Create Events

- Title, date/time, location, capacity
- Optional description
- Validation for future events
- Auto-publish to feed

### ✅ My Events

- Section for events you're hosting
- Section for events you've joined
- Quick navigation to event details

### ✅ Feedback

- Submit feedback/suggestions
- Anonymous or authenticated

## 🎨 Design System

The app follows OSU's brand colors and design principles:

### Colors

- **Scarlet**: `#BB0000` - Primary actions, headers
- **Dark Gray**: `#222222` - Text, UI elements
- **Light Gray**: `#F7F7F7` - Backgrounds
- **White**: `#FFFFFF` - Cards, inputs

### Components

- **PrimaryButton**: Scarlet background, white text
- **SecondaryButton**: Scarlet border and text
- **Card**: White background, rounded corners, subtle shadow

### Principles

- Clean, minimalistic design
- Bold typography
- Consistent spacing (4-6 scale)
- Professional campus feel

## 🗄️ Database Schema

### Tables

**profiles**

- `id` (UUID, FK to auth.users)
- `email` (TEXT, unique)
- `display_name` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)

**events**

- `id` (UUID, PK)
- `host_id` (UUID, FK to profiles)
- `title` (TEXT)
- `start_time` (TIMESTAMPTZ)
- `end_time` (TIMESTAMPTZ)
- `location_text` (TEXT)
- `capacity` (INTEGER)
- `description` (TEXT, nullable)
- `status` ('active' | 'canceled')
- `created_at` (TIMESTAMPTZ)

**event_members**

- `event_id` (UUID, FK to events)
- `user_id` (UUID, FK to profiles)
- `joined_at` (TIMESTAMPTZ)
- Primary key: (event_id, user_id)

**feedback**

- `id` (UUID, PK)
- `user_id` (UUID, FK to profiles, nullable)
- `message` (TEXT)
- `screen` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)

### Row Level Security (RLS)

All tables have RLS enabled with policies:

- Users can read all active events
- Users can only modify their own data
- Hosts can manage their own events
- Users can join/leave events (with capacity checks in app logic)

## 🧪 Testing the App

### Test Flow

1. **Sign Up**
   - Enter an @osu.edu email
   - Check email for OTP code
   - Enter code to sign in

2. **Create Event**
   - Navigate to "Create" tab
   - Fill in event details (use future dates)
   - Submit event

3. **Browse Events**
   - View created event in "Feed" tab
   - Test filters (Next 3 Hours, Today)
   - Tap event to view details

4. **Join Event**
   - Sign in with different @osu.edu account
   - Browse feed
   - Join an event

5. **My Events**
   - Check "My Events" tab
   - See hosting/joined sections

6. **Feedback**
   - Submit feedback from the app

## 🔧 Development

### Available Scripts

```bash
# Start mobile dev server
pnpm mobile

# Type checking
pnpm --filter mobile typecheck
pnpm --filter shared typecheck
```

### Code Structure

- **Screens**: All screens are in `apps/mobile/app/`
- **Components**: Reusable components in `apps/mobile/components/`
- **Types**: Shared types in `packages/shared/src/types.ts`
- **Database types**: Auto-generated in `apps/mobile/lib/database.types.ts`

## 📝 Notes

### Current Limitations (MVP Scope)

- No image uploads
- No push notifications
- No in-app messaging
- No event search
- Date/time input is manual text (no picker)
- No analytics

### Future Enhancements

- Date/time pickers
- Event search and categories
- User profiles with avatars
- Event images
- Push notifications for joined events
- Event comments/chat
- Share events

## 🐛 Troubleshooting

### App won't connect to Supabase

- Verify `.env` file has correct URL and anon key
- Restart the Expo dev server
- Check Supabase dashboard is accessible

### OTP emails not arriving

- Check spam folder
- Verify email provider is enabled in Supabase
- Check Supabase logs in dashboard

### RLS Policy Errors

- Ensure all policies in migration were created
- Check user is authenticated before accessing data
- Verify `auth.uid()` matches expected user ID

### TypeScript Errors

- Run `pnpm install` in root directory
- Ensure workspace is recognized by VS Code
- Restart TypeScript server

## 📄 License

MIT

## 👥 Contributing

This is an MVP for class demo. Focus on stability over features.

---

**Built with ❤️ for OSU students**
