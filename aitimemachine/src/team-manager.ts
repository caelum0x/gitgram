import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface User {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  createdAt: string;
  role: 'admin' | 'member' | 'viewer';
}

interface Team {
  id: string;
  name: string;
  members: string[];
  projects: string[];
  createdAt: string;
}

/**
 * Simple team/user management for multi-user scenarios
 */
export class TeamManager {
  private dataDir: string;
  private usersFile: string;
  private teamsFile: string;

  constructor() {
    this.dataDir = path.join(process.env.HOME || '', '.aitimemachine-server');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.teamsFile = path.join(this.dataDir, 'teams.json');
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private loadUsers(): User[] {
    if (!fs.existsSync(this.usersFile)) return [];
    try { return JSON.parse(fs.readFileSync(this.usersFile, 'utf-8')); } catch { return []; }
  }

  private saveUsers(users: User[]) {
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2));
  }

  private loadTeams(): Team[] {
    if (!fs.existsSync(this.teamsFile)) return [];
    try { return JSON.parse(fs.readFileSync(this.teamsFile, 'utf-8')); } catch { return []; }
  }

  private saveTeams(teams: Team[]) {
    fs.writeFileSync(this.teamsFile, JSON.stringify(teams, null, 2));
  }

  // User operations
  createUser(name: string, email: string, role: 'admin' | 'member' | 'viewer' = 'member'): User {
    const users = this.loadUsers();
    const user: User = {
      id: crypto.randomUUID(),
      name,
      email,
      apiKey: crypto.randomBytes(24).toString('hex'),
      createdAt: new Date().toISOString(),
      role,
    };
    users.push(user);
    this.saveUsers(users);
    return user;
  }

  getUser(idOrEmail: string): User | null {
    const users = this.loadUsers();
    return users.find(u => u.id === idOrEmail || u.email === idOrEmail) || null;
  }

  getUserByApiKey(apiKey: string): User | null {
    return this.loadUsers().find(u => u.apiKey === apiKey) || null;
  }

  listUsers(): User[] {
    return this.loadUsers().map(u => ({ ...u, apiKey: '***' }));
  }

  deleteUser(id: string): boolean {
    const users = this.loadUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    users.splice(idx, 1);
    this.saveUsers(users);
    return true;
  }

  // Team operations
  createTeam(name: string, adminId: string): Team {
    const teams = this.loadTeams();
    const team: Team = {
      id: crypto.randomUUID(),
      name,
      members: [adminId],
      projects: [],
      createdAt: new Date().toISOString(),
    };
    teams.push(team);
    this.saveTeams(teams);
    return team;
  }

  getTeam(id: string): Team | null {
    return this.loadTeams().find(t => t.id === id) || null;
  }

  listTeams(): Team[] {
    return this.loadTeams();
  }

  addMember(teamId: string, userId: string): boolean {
    const teams = this.loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team || team.members.includes(userId)) return false;
    team.members.push(userId);
    this.saveTeams(teams);
    return true;
  }

  removeMember(teamId: string, userId: string): boolean {
    const teams = this.loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team) return false;
    team.members = team.members.filter(m => m !== userId);
    this.saveTeams(teams);
    return true;
  }

  addProject(teamId: string, projectPath: string): boolean {
    const teams = this.loadTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team || team.projects.includes(projectPath)) return false;
    team.projects.push(projectPath);
    this.saveTeams(teams);
    return true;
  }

  // Access control
  canAccess(userId: string, projectPath: string): boolean {
    const user = this.getUser(userId);
    if (!user) return false;
    if (user.role === 'admin') return true;
    
    const teams = this.loadTeams();
    return teams.some(t => t.members.includes(userId) && t.projects.includes(projectPath));
  }

  getUserTeams(userId: string): Team[] {
    return this.loadTeams().filter(t => t.members.includes(userId));
  }
}
