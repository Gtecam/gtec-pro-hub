import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Phone } from "lucide-react";

type CallKind =
  | "appel_sortant"
  | "appel_entrant"
  | "appel_accepte"
  | "appel_recu"
  | "appel_decroche"
  | "appel_terminé";

type Props = {
  className?: string;
};

type ConvRoom = {
  _id: Id<"chatRooms">;
  _creationTime: number;
  requestId?: Id<"serviceRequests">;
  subject?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  participantIds: Id<"users">[];
};

type ConvLastMsg = {
  _id: Id<"conversationMessages">;
  _creationTime: number;
  body?: string;
  callKind?: CallKind;
  roomId: Id<"chatRooms">;
  senderId: Id<"users">;
  at: number;
  senderName?: string;
  isMe?: boolean;
};

type ConvParticipant = { _id: Id<"users">; name: string; phone?: string | null };

type ConversationSummary = {
  room: ConvRoom;
  lastMessage: ConvLastMsg | null;
  otherParticipants: (ConvParticipant | null)[];
};

export type ConversationMessage = {
  _id: Id<"conversationMessages">;
  roomId: Id<"chatRooms">;
  senderId: Id<"users">;
  body?: string;
  callKind?: CallKind;
  at: number;
  senderName: string;
  isMe: boolean;
};

type EnrichedMsg = ConversationMessage;

function enrichMsg(m: ConvLastMsg): EnrichedMsg {
  return {
    _id: m._id,
    roomId: m.roomId,
    senderId: m.senderId,
    body: m.body,
    callKind: m.callKind,
    at: m.at,
    senderName: m.senderName ?? "Utilisateur",
    isMe: m.isMe ?? false,
  };
}

export function ConversationPanel({ className }: Props) {
  const { user } = useAuth();
  const listConversations = useQuery(api.gtec.listConversations);
  const [activeRoom, setActiveRoom] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<EnrichedMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendMessage = useMutation(api.gtec.sendMessage);

  const conversations = listConversations ?? [];

  const msgsResult = useQuery(
    api.gtec.listMessages,
    activeRoom ? { roomId: activeRoom.room._id } : "skip",
  );
  useEffect(() => {
    if (msgsResult && Array.isArray(msgsResult)) {
      setMessages(msgsResult.map(enrichMsg) as EnrichedMsg[]);
    }
  }, [msgsResult]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const pickRoom = (conv: ConversationSummary) => {
    setActiveRoom(conv);
    setDraft("");
  };

  const otherP = activeRoom?.otherParticipants.find(Boolean);
  const otherName = otherP?.name ?? "Interlocuteur";
  const otherInitial = otherName[0]?.toUpperCase() ?? "?";
  const subject = activeRoom?.room.subject ?? "Sans objet";

  const lastDisplay =
    activeRoom?.lastMessage?.body ??
    activeRoom?.lastMessage?.callKind?.replace(/_/g, " ") ??
    "Nouveau message";

  const handleSend = async () => {
    if (!draft.trim() || !activeRoom || sending) return;
    setSending(true);
    try {
      await sendMessage({ roomId: activeRoom.room._id, body: draft.trim() });
      setDraft("");
    } catch {
      /* error handled by Convex */
    } finally {
      setSending(false);
    }
  };

  const handleCallKind = async (ck: CallKind) => {
    if (!activeRoom || sending) return;
    setSending(true);
    try {
      await sendMessage({ roomId: activeRoom.room._id, callKind: ck });
    } catch {
      /* error handled by Convex */
    } finally {
      setSending(false);
    }
  };

  const roomId = activeRoom?.room._id;
  const canSend = roomId && draft.trim() && !sending;

  return (
    <Card className={cn("card-layered", className)}>
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Send className="size-4 text-primary" />
          <span>Messages</span>
        </div>

        <div className="flex flex-col gap-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune conversation pour le moment.
            </p>
          ) : (
            <ScrollArea className="h-[180px] rounded-lg border border-border/70">
              <div className="flex flex-col gap-1.5 p-2">
                {conversations.map((conv) => {
                  const name =
                    conv.otherParticipants.find(Boolean)?.name ?? "Conversation";
                  const initial = name[0]?.toUpperCase() ?? "?";

                  return (
                    <button
                      key={conv.room._id}
                      onClick={() => pickRoom(conv)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        activeRoom?.room._id === conv.room._id
                          ? "bg-primary/5 ring-1 ring-primary/20"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {initial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lastDisplay}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {activeRoom && (
          <>
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {otherInitial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{otherName}</p>
                <p className="text-xs text-muted-foreground">{subject}</p>
              </div>
            </div>

            <ScrollArea className="h-[240px] rounded-lg border border-border/70 bg-muted/30 p-2">
              <div ref={scrollRef} className="flex flex-col gap-2">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aucun message. Débutez la conversation.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m._id}
                      className={cn(
                        "flex flex-col gap-0.5",
                        m.isMe ? "items-end" : "items-start",
                      )}
                    >
                      {!m.isMe && (
                        <span className="text-[10px] text-muted-foreground">
                          {m.senderName}
                        </span>
                      )}
                      <div
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm",
                          m.isMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {m.callKind ? (
                          <span className="text-xs capitalize">
                            {m.callKind.replace(/_/g, " ")}
                          </span>
                        ) : (
                          m.body
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(m.at).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="halo-amber"
                onClick={() => handleCallKind("appel_sortant")}
                disabled={sending}
              >
                <Phone className="size-4" />
                Appeler
              </Button>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button
                size="sm"
                className="halo-amber"
                onClick={handleSend}
                disabled={!canSend}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
