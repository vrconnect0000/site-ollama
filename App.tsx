
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { LiveVoiceSession } from './components/LiveVoiceSession';
import { ChatSession, UserProfile, Message } from './types';
import { generateResponse } from './services/geminiService';
import { supabase } from './lib/supabase';

const INITIAL_SESSIONS: ChatSession[] = [
  {
    id: 'public-room-1',
    name: 'Lounge da Nova',
    avatar: 'https://picsum.photos/seed/nova/200',
    personality: 'Você é Nova, a anfitriã desta sala pública. Você incentiva a conversa entre as pessoas. Responda de forma breve e em português.',
    messages: []
  },
  {
    id: 'creative-space',
    name: 'Espaço Criativo',
    avatar: 'https://picsum.photos/seed/echo/200',
    personality: 'Você é Eco, uma IA que inspira criatividade. Responda em português.',
    messages: []
  }
];

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>(INITIAL_SESSIONS[0].id);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('nexus_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [userNameInput, setUserNameInput] = useState('');

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // 1. Carregar mensagens iniciais do Supabase
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('timestamp', { ascending: true })
        .limit(100);

      if (!error && data) {
        setSessions(prev => prev.map(s => 
          s.id === activeSessionId ? { ...s, messages: data } : s
        ));
      }
    };

    fetchMessages();

    // 2. Inscrição Realtime para novas mensagens
    const channel = supabase
      .channel(`room-${activeSessionId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `session_id=eq.${activeSessionId}` 
      }, (payload) => {
        const newMessage = payload.new as Message;
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) {
            // Evita duplicatas se o próprio usuário enviou
            if (s.messages.find(m => m.id === newMessage.id)) return s;
            return { ...s, messages: [...s.messages, newMessage] };
          }
          return s;
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSessionId]);

  const handleSendMessage = async (text: string, image?: string) => {
    if (!userProfile) return;

    const messageId = Math.random().toString(36).substring(7);
    const newUserMessage: Partial<Message> = {
      id: messageId,
      role: 'user',
      text,
      timestamp: Date.now(),
      image,
      user_name: userProfile.name,
      user_avatar: userProfile.avatar,
      session_id: activeSessionId
    };

    // Salva no Supabase (o Realtime atualizará a lista para todos)
    const { error } = await supabase.from('messages').insert([newUserMessage]);
    
    if (error) {
      console.error('Erro ao enviar para Supabase:', error);
      return;
    }

    // Lógica do Bot (apenas um usuário processa a resposta da IA para evitar loops)
    // Aqui simplificamos: quem envia, solicita a resposta da IA
    try {
      const responseText = await generateResponse(
        text, 
        activeSession.messages.slice(-5), 
        activeSession.personality,
        image
      );

      const botMessage: Partial<Message> = {
        id: Math.random().toString(36).substring(7),
        role: 'model',
        text: responseText || '...',
        timestamp: Date.now(),
        session_id: activeSessionId
      };

      await supabase.from('messages').insert([botMessage]);
    } catch (err) {
      console.error('Erro Gemini:', err);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userNameInput.trim()) return;
    const newProfile = {
      name: userNameInput.trim(),
      avatar: `https://picsum.photos/seed/${userNameInput.trim()}/200`
    };
    setUserProfile(newProfile);
    localStorage.setItem('nexus_user', JSON.stringify(newProfile));
  };

  if (!userProfile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0f172a] p-4">
        <div className="max-w-md w-full glass p-8 rounded-3xl border border-indigo-500/20 shadow-2xl text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Nexus Chat
          </h1>
          <p className="text-slate-400 mb-8">Entre para conversar com pessoas e IAs em tempo real.</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input 
              type="text" 
              placeholder="Seu apelido..." 
              value={userNameInput}
              onChange={e => setUserNameInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              autoFocus
            />
            <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/20 transition-all">
              Entrar no Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      <Sidebar 
        sessions={sessions} 
        activeId={activeSessionId} 
        onSelect={setActiveSessionId} 
        user={userProfile}
      />
      
      <main className="flex-1 flex flex-col relative h-full">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#0f172a]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <img src={activeSession.avatar} className="w-10 h-10 rounded-full object-cover border border-indigo-500/30" alt="" />
            <div>
              <h2 className="font-semibold text-slate-100">{activeSession.name}</h2>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs text-slate-400">Sala Global</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
              onClick={() => setIsLiveMode(true)}
              className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-all text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              Voz ao Vivo
            </button>
          </div>
        </header>

        <ChatWindow 
          session={activeSession} 
          onSendMessage={handleSendMessage} 
          currentUser={userProfile}
        />
      </main>

      {isLiveMode && (
        <LiveVoiceSession 
          onClose={() => setIsLiveMode(false)} 
          personality={activeSession.personality}
        />
      )}
    </div>
  );
}
