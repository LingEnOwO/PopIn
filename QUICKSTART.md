# PopIn - Quick Start Guide

## 📦 What's Been Built

A complete, runnable MVP monorepo with:

- ✅ Expo mobile app with Expo Router navigation
- ✅ NativeWind (Tailwind) styling with OSU brand colors
- ✅ Supabase authentication (Email OTP, @osu.edu only)
- ✅ Full event management (create, browse, join, leave)
- ✅ My Events page (hosting + joined)
- ✅ Feedback system
- ✅ Complete database schema with RLS
- ✅ Type-safe with TypeScript
- ✅ Clean, professional OSU-themed UI

## 🚀 3-Step Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Supabase

1. Create project at supabase.com
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
3. Copy `.env.example` to `.env` in `apps/mobile/`
4. Add your Supabase URL and anon key

### 3. Run the App

```bash
pnpm mobile
```

Scan QR code with Expo Go app on your phone!

## 📂 Project Structure

```
PopIn/
├── apps/mobile/                    # Expo app
│   ├── app/                        # Screens (Expo Router)
│   │   ├── index.tsx              # Auth (Email OTP)
│   │   └── (app)/                 # Protected routes
│   │       ├── feed.tsx           # Event feed with filters
│   │       ├── create.tsx         # Create event form
│   │       ├── my-events.tsx      # Hosting + Joined
│   │       ├── feedback.tsx       # Feedback form
│   │       └── event/[id].tsx     # Event detail + Join/Leave
│   ├── components/                # UI components
│   │   ├── Button.tsx             # Primary/Secondary buttons
│   │   ├── Card.tsx               # Card container
│   │   └── EventCard.tsx          # Event list item
│   └── lib/
│       ├── supabase.ts            # Supabase client
│       └── database.types.ts      # Generated types
├── packages/shared/                # Shared types
└── supabase/migrations/           # Database schema
```

## 🎨 OSU Design System

**Colors:**

- Scarlet: `#BB0000` (Primary buttons, headers)
- Dark: `#222222` (Text)
- Light: `#F7F7F7` (Background)

**Components:**

- `<PrimaryButton>` - Scarlet background, white text
- `<SecondaryButton>` - Scarlet border/text
- `<Card>` - White with rounded corners

## 🔑 Key Features

### Auth

- Email OTP sign-in (Supabase Auth)
- @osu.edu email restriction
- Auto profile creation

### Events

- Create with title, time, location, capacity
- Browse with filters (All, Next 3 Hours, Today)
- Join/Leave with capacity checking
- View attendee count

### My Events

- Hosting section
- Joined section

### Feedback

- Simple feedback form
- Saves to Supabase

## 🗄️ Database Tables

- `profiles` - User profiles
- `events` - Event details
- `event_members` - Event attendees (join table)
- `feedback` - User feedback

All tables have RLS policies for security.

## 📱 Testing

1. Use an @osu.edu email (or configure Supabase for testing)
2. Create an event (use future dates)
3. View in feed
4. Join with another account
5. Check My Events

## 🎯 MVP Scope

**Included:**

- Full auth flow
- Event CRUD
- Event joining
- Filters
- Feedback

**Not Included (Future):**

- Image uploads
- Push notifications
- Event search
- In-app chat
- Date pickers (using text input)

## 💡 Tips

- Events must have future start times
- Capacity must be > 0
- Date format: MM/DD/YYYY
- Time format: HH:MM (24-hour)
- Pull to refresh on feed/my-events

## 🔧 Development Commands

```bash
# Run mobile app
pnpm mobile

# Type checking
pnpm --filter mobile typecheck

# Run on specific platform
pnpm mobile:ios
pnpm mobile:android
```

## ✅ Ready to Ship

The app is complete, type-safe, and ready to run. Follow the README.md for detailed setup instructions.

**No custom backend needed - Supabase handles everything!**
