
export interface GroupSettings {
  messagePermission: 'all' | 'admin_only';
  addMemberPermission: 'admin_only' | 'everyone';
  allowMemberLeave: boolean;
  slowMode: boolean;
  slowModeSeconds: number;
  mode?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  ownerId: string; // The primary administrator
  admins: string[];
  members: string[];
  createdAt: string;
  avatar: string | null;
  settings: GroupSettings;
  muted?: boolean;
}

export const mockGroups: Group[] = [
  {
    id: 'g1',
    name: 'Q2 Sprint Team',
    description: 'Engineering sprint coordination for Q2',
    createdBy: 'u1',
    ownerId: 'u1',
    admins: ['u1'],
    members: ['u1', 'u2', 'u4'],
    createdAt: '2024-04-01T09:00:00Z',
    avatar: null,
    settings: {
      messagePermission: 'all',
      addMemberPermission: 'admin_only',
      allowMemberLeave: true,
      slowMode: false,
      slowModeSeconds: 30,
    }
  },
  {
    id: 'g2',
    name: 'Brand & Design',
    description: 'Brand refresh and design system',
    createdBy: 'u2',
    ownerId: 'u2',
    admins: ['u2'],
    members: ['u2', 'u3', 'u6'],
    createdAt: '2024-03-20T10:00:00Z',
    avatar: null,
    settings: {
      messagePermission: 'all',
      addMemberPermission: 'everyone',
      allowMemberLeave: true,
      slowMode: false,
      slowModeSeconds: 30,
    }
  },
  {
    id: 'g3',
    name: 'Marketing Ops',
    description: 'Campaign planning and outreach',
    createdBy: 'u1',
    ownerId: 'u1',
    admins: ['u1'],
    members: ['u1', 'u3', 'u5'],
    createdAt: '2024-03-10T11:00:00Z',
    avatar: null,
    settings: {
      messagePermission: 'admin_only',
      addMemberPermission: 'admin_only',
      allowMemberLeave: true,
      slowMode: false,
      slowModeSeconds: 30,
    }
  },
];
