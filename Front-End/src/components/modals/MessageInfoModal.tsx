
"use client";

import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Avatar } from '../ui/avatar';
import { Check, CheckCheck, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { getMessageReadReceipts, getMessageDeliveryReceipts } from '@/services/readReceipts';
import { Message } from '@/mock/messages';

const MessageInfoModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const isOpen = state.activeModal === 'messageInfo';
  const message = state.modalData?.message as Message | null;

  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [deliveries, setDeliveries] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !message) return;
    setLoading(true);
    setReads({});
    setDeliveries({});

    let readsDone = false;
    let deliveriesDone = false;
    const checkDone = () => { if (readsDone && deliveriesDone) setLoading(false); };

    getMessageReadReceipts(message.id, (list) => {
      setReads(Object.fromEntries(list.map(r => [r.userId, r.readAt])));
      readsDone = true;
      checkDone();
    });
    getMessageDeliveryReceipts(message.id, (list) => {
      setDeliveries(Object.fromEntries(list.map(d => [d.userId, d.deliveredAt])));
      deliveriesDone = true;
      checkDone();
    });
  }, [isOpen, message?.id]);

  if (!isOpen || !message) return null;

  const handleClose = () => dispatch({ type: 'CLOSE_MODAL' });

  const group = state.groups.find(g => g.id === state.activeConversation?.id);
  const members = (group?.members || [])
    .filter(id => id !== message.senderId)
    .map(id => state.users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  const readMembers = members
    .filter(u => reads[u.id])
    .sort((a, b) => new Date(reads[b.id]).getTime() - new Date(reads[a.id]).getTime());
  const deliveredOnlyMembers = members.filter(u => !reads[u.id] && deliveries[u.id]);
  const pendingMembers = members.filter(u => !reads[u.id] && !deliveries[u.id]);

  const renderRow = (user: NonNullable<typeof members[number]>, timeLabel?: string) => (
    <div key={user.id} className="flex items-center gap-3.5 py-2.5 px-1">
      <Avatar name={user.name} src={user.avatar} size="md" status={user.status as any} showStatus />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{user.name}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.department}</p>
      </div>
      {timeLabel && <span className="text-[10px] text-muted-foreground shrink-0">{timeLabel}</span>}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Message Info" maxWidth="max-w-2xl">
      <div className="px-6 pb-6">
        <div className="mb-4 p-3 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {message.content || (message.files?.length ? `📎 ${message.files.length} file${message.files.length > 1 ? 's' : ''}` : 'Message')}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5">{format(new Date(message.timestamp), 'MMM d, h:mm a')}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {readMembers.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-primary">
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Read by {readMembers.length}</span>
                </div>
                {readMembers.map(u => renderRow(u, format(new Date(reads[u.id]), 'h:mm a')))}
              </div>
            )}
            {deliveredOnlyMembers.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Delivered to {deliveredOnlyMembers.length}</span>
                </div>
                {deliveredOnlyMembers.map(u => renderRow(u))}
              </div>
            )}
            {pendingMembers.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Sent to {pendingMembers.length}</span>
                </div>
                {pendingMembers.map(u => renderRow(u))}
              </div>
            )}
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No other members in this group.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MessageInfoModal;
