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
  roomId: Id<"chatRooms">;
  className?: string;
};

type ConvRoom = {
  _id: Id<"chatRooms">;
  _creationTime: number;
  requestId?: Id<"serviceRequests">;
  subject?: string;
  status: "active" | "archived" | "closed";
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
};

type ConvParticipant = { _id: Id<"users">; name: string; phone?: string | null };

type ConversationWithLastMessage = {
  room: ConvRoom;
  lastMessage: ConvLastMsg | null;
  otherParticipants: ConvParticipant[];
};

type Message = {
  _id: Id<"conversationMessages">;
  _creationTime: number;
  roomId: Id<"chatRooms">;
  senderId: Id<"users">;
  body?: string;
  callKind?: CallKind;
  at: number;
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function messageLabel(msg: Message) {
  if (msg.callKind) {
    const map: Record<CallKind, string> = {
      appel_sortant: "Appel sortant",
      appel_entrant: "Appel entrant",
      appel_accepte: "Appel accepté",
      appel_recu: "Appel reçu",
      appel_decroche: "Appel décroché",
      appel_terminé: "Appel terminé",
    };
    return map[msg.callKind] ?? "Notification d'appel";
  }
  return msg.body ?? "Message";
}

type ListRow = {
  roomId: Id<"chatRooms">;
  roomSubject?: string;
  otherName: string | null;
  otherPhone?: string | null;
  lastAt?: number;
  lastCallKind?: CallKind;
  lastBody?: string;
  isLastMine: boolean;
};

export function ConversationListPanel({ className }: Props) {
  const { user } = useAuth();
  const list = useQuery(api.gtec.listConversations, {});

  if (!user) {
    return (
      <Card className={cn("rounded-xl border-border/60 bg-card", className)}>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Connectez-vous pour voir vos conversations.
        </CardContent>
      </Card>
    );
  }

  const rows: ListRow[] = (list ?? []).map((item) => {
    const firstOther = (item.otherParticipants.find(Boolean) ?? null);
    const last = item.lastMessage;
    return {
      roomId: item.room._id,
      roomSubject: item.room.subject ?? undefined,
      otherName: firstOther?.name ?? (item.room.subject ?? "Conversation"),
      otherPhone: firstOther?.phone ?? undefined,
      lastAt: last?.at,
      lastCallKind: last?.callKind,
      lastBody: last?.body,
      isLastMine: last?.senderId === user?._id,
    };
  });

  return (
    <Card className={cn("rounded-xl border-border/60 bg-card overflow-hidden", className)}>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Conversations
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune conversation pour le moment.</p>
        ) : (
          <ScrollArea className="h-[220px] pr-1">
            <div className="flex flex-col gap-2">
              {rows.map((row) => {
                const subject =
                  row.roomSubject ?? (row.otherName ?? "Conversation");
                let preview: string;
                if (row.lastAt == null) {
                  preview = "Démarrer la conversation";
                } else if (row.lastCallKind) {
                  preview = "Nouvelle notification d'appel";
                } else {
                  preview =
                    row.isLastMine
                      ? "Vous : " + (row.lastBody ?? "")
                      : (row.otherName ?? "") + " : " + (row.lastBody ?? "");
                }
                return (
                  <button
                    key={row.roomId}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border-border/60 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    )}
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("gtc:open-conversation", {
                          detail: { roomId: row.roomId },
                        }),
                      );
                    }}
                  >
                    <Avatar className="mt-0.5 size-9 flex-none">
                      <AvatarFallback className="rounded-lg">
                        {initials(row.otherName ?? undefined)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {subject}
                        </p>
                        {row.lastAt != null ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {new Date(row.lastAt).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {preview}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function ConversationPanel({ roomId, className }: Props) {
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  const messages = useQuery(api.gtec.listMessages, { roomId }) as Message[] | null;
  const send = useMutation(api.gtec.sendMessage);

  useEffect(() => {
    if (messages && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey && draft.trim().length > 0) {
        e.preventDefault();
        handleSend();
      }
    }
    const node = inputRef.current;
    node?.addEventListener("keydown", handleKey);
    return () => node?.removeEventListener("keydown", handleKey);
  }, [draft]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !user) return;
    setDraft("");
    await send({ roomId, body: text });
  }

  async function handleCall(kind: CallKind) {
    if (!user) return;
    await send({ roomId, callKind: kind });
  }

  function colorFor(senderId: Id<"users">) {
    return senderId === user?._id ? "text-primary" : "text-foreground";
  }

  if (!user) {
    return (
      <Card className={cn("rounded-xl border-border/60 bg-card", className)}>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Connectez-vous pour rejoindre cette conversation.
        </CardContent>
      </Card>
    );
  }

  if (!messages) {
    return (
      <Card className={cn("rounded-xl border-border/60 bg-card", className)}>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Chargement des messages…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-xl border-border/60 bg-card flex flex-col overflow-hidden", className)}>
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Discussion</h3>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            const isMe = msg.senderId === user?._id;
            return (
              <div
                key={msg._id}
                className={cn(
                  "flex w-full max-w-[85%] gap-2 rounded-xl px-3 py-2",
                  isMe
                    ? "items-end rounded-br-md bg-primary text-primary-foreground"
                    : "items-start rounded-bl-md bg-muted/60 text-foreground",
                )}
              >
                {!isMe && (
                  <Avatar className="mt-0.5 size-6 shrink-0">
                    <AvatarFallback className="rounded-full">
                      {initials(undefined)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0 flex flex-col">
                  <p className={cn("text-sm leading-relaxed break-words", colorFor(msg.senderId))}>
                    {messageLabel(msg)}
                  </p>
                  <p className="mt-0.5 text-[11px] opacity-70">
                    {new Date(msg.at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border/60 p-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9"
            title="Appel sortant"
            onClick={() => handleCall("appel_sortant")}
          >
            <Phone className="size-4" />
          </Button>
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Écrire un message…"
            className="h-9 flex-1"
          />
          <Button
            type="button"
            size="icon"
            className="size-9"
            disabled={draft.trim().length === 0}
            onClick={handleSend}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export type { ConversationWithLastMessage, Message };
