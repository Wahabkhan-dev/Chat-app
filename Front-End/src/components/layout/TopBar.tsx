
"use client";

import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Search, UserPlus, X } from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { cn } from '@/lib/utils';
import NotificationBell from './NotificationBell';

const TopBar: React.FC<{ onCreateUser: () => void }> = ({ onCreateUser }) => {
  const { state, dispatch } = useAppContext();
  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const searchResults = useMemo(() => {
    if (globalSearch.length < 2) return null;
    return {
      people: state.users.filter(u => u.name.toLowerCase().includes(globalSearch.toLowerCase())),
      groups: state.groups.filter(g => g.name.toLowerCase().includes(globalSearch.toLowerCase())),
    };
  }, [globalSearch, state.users, state.groups]);

  const handleSelectResult = (type: 'dm' | 'group', item: any) => {
    let id: string;
    if (type === 'dm') {
      const a = Number(state.currentUser?.id);
      const b = Number(item.id);
      id = `dm_${Math.min(a, b)}_${Math.max(a, b)}`;
    } else {
      id = item.id;
    }
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id, name: item.name, avatar: item.avatar || null } });
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'chat' });
    setGlobalSearch('');
    setShowSearchResults(false);
  };

  return (
    <div className="h-14 border-b bg-card text-card-foreground flex items-center justify-between px-3 md:px-6 shrink-0 relative z-50 shadow-sm gap-2">
      <div className="flex-1 max-w-2xl relative mx-auto group">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search team members or group spaces..."
            className="w-full pl-10 pr-10 py-2 bg-muted/40 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
            value={globalSearch}
            onChange={(e) => { setGlobalSearch(e.target.value); setShowSearchResults(true); }}
            onFocus={() => setShowSearchResults(true)}
          />
          {globalSearch && <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full" onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>

        {showSearchResults && searchResults && (
          <div className="absolute top-full left-0 w-full mt-2 bg-card rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-border p-4 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
            {searchResults.people.length === 0 && searchResults.groups.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <Search className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-bold uppercase tracking-widest">No matching results</p>
              </div>
            ) : (
              <div className="space-y-6">
                {searchResults.people.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">People</h4>
                    <div className="space-y-1">
                      {searchResults.people.map(u => (
                        <div
                          key={u.id}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-xl transition-all",
                            u.isActive === false
                              ? "opacity-60 cursor-default"
                              : "hover:bg-muted cursor-pointer"
                          )}
                          onClick={() => u.isActive !== false && handleSelectResult('dm', u)}
                        >
                          <Avatar
                            name={u.name}
                            src={u.avatar}
                            size="sm"
                            status={u.isActive === false ? undefined : u.status}
                            showStatus={u.isActive !== false}
                            className={u.isActive === false ? 'grayscale' : ''}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-foreground truncate">{u.name}</p>
                              {u.isActive === false && (
                                <span className="shrink-0 text-[9px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">Inactive</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{u.department}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {searchResults.groups.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Work Groups</h4>
                    <div className="space-y-1">
                      {searchResults.groups.map(g => (
                        <div key={g.id} className="flex items-center gap-3 p-2.5 hover:bg-muted rounded-xl cursor-pointer transition-all" onClick={() => handleSelectResult('group', g)}>
                          <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">{g.name[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{g.members.length} Members</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-3 ml-1 md:ml-4 shrink-0">
        {state.currentUser?.role === 'admin' && (
          <button onClick={onCreateUser} className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-primary flex items-center gap-2 md:px-3 border border-transparent hover:border-primary/20">
            <UserPlus className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-widest hidden md:inline">Add Member</span>
          </button>
        )}

        <NotificationBell />
      </div>
    </div>
  );
};

export default TopBar;
