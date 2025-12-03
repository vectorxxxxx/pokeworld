import { useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';

export default function ConversationLog({
  conv,
  worldId,
  onNewMessage,
}: {
  conv: any;
  worldId?: string;
  onNewMessage?: (m: any) => void;
}) {
  const convMessages = useQuery(
    api.messages.listMessages,
    worldId && conv ? { worldId: worldId as any, conversationId: conv.id } : 'skip',
  );

  useEffect(() => {
    if (!convMessages || !onNewMessage || !conv) return;
    for (const m of convMessages) {
      try {
        onNewMessage({ ...m, conversationId: conv.id });
      } catch (e) {
        // ignore errors from consumer
      }
    }
  }, [convMessages, onNewMessage, conv]);

  const isTyping = conv?.isTyping;

  if (!conv) return null;

  return (
    <div key={conv?.id}>
      {convMessages &&
        convMessages.map((m: any) => (
          <div key={m._id} className="log-item">
            <span className="log-time">
              {new Date(m._creationTime).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
            </span>
            <span style={{ marginLeft: 8 }}>
              <strong>{m.authorName}: </strong>
              {m.text}
            </span>
          </div>
        ))}

      {isTyping && (
        <div className="log-item" key={`typing-${conv.id}`}>
          <span className="log-time">
            {new Date(isTyping.since).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
          </span>
          <span style={{ marginLeft: 8 }}>
            <em>{(conv?.game?.playerDescriptions?.get(isTyping.playerId) as any)?.name ?? 'Someone'} is typing...</em>
          </span>
        </div>
      )}

      {[...(conv?.participants?.entries?.() ?? [])].map(([playerId, member]: any) => {
        const playerName = (conv?.game?.playerDescriptions?.get(playerId) as any)?.name ?? member?.name;
        if (!playerName) return null;
        if (member?.status?.kind === 'participating' && member?.status?.started) {
          return (
            <div key={`joined-${conv.id}-${playerId}`} className="log-item">
              <span className="log-time">
                {new Date(member.status.started).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ marginLeft: 8 }}>{playerName} joined the conversation.</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
