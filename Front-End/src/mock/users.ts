
export type UserRole = 'admin' | 'user';
export type UserStatus = 'online' | 'away' | 'offline' | 'dnd';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatar: string;
  status: UserStatus;
  department: string;
  createdAt: string;
  isActive?: boolean;
}

export const mockUsers: User[] = [
  {
    id: 'u1',
    name: 'Arham Nawaz',
    email: 'admin@mawbytec.com',
    password: 'admin123',
    role: 'admin',
    avatar: 'https://picsum.photos/seed/u1/150/150',
    status: 'online',
    department: 'Engineering',
    createdAt: '2023-01-15T09:00:00Z',
  },
  {
    id: 'u2',
    name: 'Sara Malik',
    email: 'user1@mawbytec.com',
    password: 'user123',
    role: 'user',
    avatar: 'https://picsum.photos/seed/u2/150/150',
    status: 'online',
    department: 'Design',
    createdAt: '2023-02-10T10:00:00Z',
  },
  {
    id: 'u3',
    name: 'Bilal Ahmed',
    email: 'bilal@mawbytec.com',
    password: 'user123',
    role: 'user',
    avatar: 'https://picsum.photos/seed/u3/150/150',
    status: 'away',
    department: 'Marketing',
    createdAt: '2023-03-05T11:00:00Z',
  },
  {
    id: 'u4',
    name: 'Zara Khan',
    email: 'zara@mawbytec.com',
    password: 'user123',
    role: 'user',
    avatar: 'https://picsum.photos/seed/u4/150/150',
    status: 'offline',
    department: 'Engineering',
    createdAt: '2023-03-20T09:30:00Z',
  },
  {
    id: 'u5',
    name: 'Hamza Raza',
    email: 'hamza@mawbytec.com',
    password: 'user123',
    role: 'user',
    avatar: 'https://picsum.photos/seed/u5/150/150',
    status: 'online',
    department: 'Sales',
    createdAt: '2023-04-01T08:00:00Z',
  },
  {
    id: 'u6',
    name: 'Nadia Farooq',
    email: 'nadia@mawbytec.com',
    password: 'user123',
    role: 'admin',
    avatar: 'https://picsum.photos/seed/u6/150/150',
    status: 'online',
    department: 'HR',
    createdAt: '2023-04-15T10:00:00Z',
  },
];
