# **App Name**: Mawby Teams Chat

## Core Features:

- Secure Authentication: Simulate user login and logout with mock credentials, providing role-based access for administrators and regular users to distinct interfaces.
- Direct & Group Messaging: Enable users to view, send, and receive text messages in one-on-one direct messages and organized group chats with support for rich content.
- File Sharing & Previews: Allow users to 'upload' and share files within any conversation, displaying relevant file cards, type icons, and inline image previews.
- Comprehensive Search: Implement a global search functionality to filter users and groups across the application, facilitating quick navigation to relevant conversations.
- Administrative Dashboard: Provide a dedicated admin interface for managing users and groups, featuring Key Performance Indicator (KPI) cards and configurable member roles.
- Notifications & Alerts: Display unread message counts, system alerts for new users or group additions, and offer in-app toast messages for operational feedback.
- Dynamic Mock Data Handling: Manage all application state, including users, groups, and messages, using client-side mock data with dynamic updates reflecting user actions without backend persistence.
- Message Reactions: Users can react to messages with a selection of emojis, providing quick feedback.
- Threaded Replies: Users can quote and reply to specific messages, creating threaded conversations.
- Message Management: Users can edit or delete their own messages within a conversation.
- Read Receipts: Display 'Seen by X' indicators under the last message in a conversation.
- Typing Indicator: Show an animated 'User is typing...' notification when another user is composing a message.
- Pinned Messages: Allow users to pin important messages to the top of a conversation for easy access.
- @Mention Notifications: Users can tag others using '@' mentions, triggering specific notifications for the mentioned user.
- Detailed User Profiles: Clicking on any user displays a dedicated profile page with their name, role, department, status, and shared files.
- Group Management Panel: Group administrators can access a dedicated panel to edit group details and manage members.
- Group Departure: Users have the option to leave any group they are a member of.
- Customizable Presence Status: Users can set their own online presence status (Online, Away, Do Not Disturb, Offline) via a dropdown.
- Conversation Shared Files: A dedicated tab within each conversation's right panel to view and filter all files shared in that specific conversation.
- Global Files Hub: A top-level page providing a comprehensive view of all files shared across the entire workspace, filterable by various criteria.
- Specific @Mention Notifications: Users receive distinct notifications specifically for direct @mentions in conversations.
- Notification Customization: Users can toggle and configure their notification preferences for different event types within their settings.
- Personal Profile Settings: Users can edit their display name, status message, and avatar URL in their personal settings.
- Theme Switching: Allows users to toggle between Light and Dark mode for the application interface.
- Message Density Toggle: Users can switch between compact and comfortable viewing modes to adjust message density in chat conversations.
- Admin Audit Log: Provides administrators with a mock log of critical actions performed across the workspace, such as user creation or group changes.
- User Deactivation: Administrators can deactivate user accounts, effectively removing them from active participation without deleting their data.
- Admin Broadcast Messaging: Allows administrators to send a message to all users in the workspace simultaneously, appearing as a notification for everyone.

## Style Guidelines:

- The primary brand color, a vibrant Orange, is '#fc692b'. It's used for interactive elements like buttons, active highlights, and sent messages, conveying a sense of energy and directness. The color choice evokes a modern and bold corporate identity for an internal communication platform.
- A dynamic Coral color, '#fe506a', serves as a secondary accent. It is strategically applied to badges, alerts, and to indicate active chats, adding a touch of urgency or emphasis to critical information.
- A bright Cyan, '#61dafb', acts as a third accent color, predominantly used for icons, links, hover effects, and online status indicators, ensuring visual clarity and highlighting interactivity.
- The main background is a very light off-white '#f9fafb', providing a clean, airy base that allows content to stand out. Complementary to this, primary surfaces such as cards and modal backgrounds are pure white '#ffffff'.
- The application supports switching between light and dark mode, offering a customizable visual experience.
- Headline font: 'Poppins', a geometric sans-serif, provides a precise and contemporary feel for titles and prominent text elements. Body text font: 'Inter', a neutral grotesque-style sans-serif, is recommended for its readability in longer content and general interface text. Note: currently only Google Fonts are supported.
- Utilize 'Lucide React' for a consistent, clear set of modern and minimalist icons throughout the application, enhancing usability and visual appeal without clutter.
- A responsive three-column layout (sidebar, chat area, toggleable right panel) optimized for desktop screens (1024px+). The design adheres to an 8px grid system for consistent spacing, with a fixed 280px sidebar for navigation.
- Incorporate subtle, functional animations such as slide-in transitions for right panels and toast notifications, along with fade and scale effects for modals, to provide a polished and intuitive user experience.