import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, User, Sparkles, Loader2, Bot, HelpCircle, BookOpen, Lightbulb, Zap } from 'lucide-react';
import { chatWithGeminiStream, ChatMessage, MCQ } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatBotProps {
  contextMCQs?: MCQ[];
}

const SUGGESTIONS = [
  { id: 'explain', label: 'Explain current concept', icon: BookOpen },
  { id: 'trick', label: 'NEET Trick/Mnemonic', icon: Zap },
  { id: 'important', label: 'Is this topic important?', icon: HelpCircle },
  { id: 'tips', label: 'Study tips for Biology', icon: Lightbulb },
];

export const ChatBot: React.FC<ChatBotProps> = ({ contextMCQs }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Add empty bot message that we'll fill with stream chunks
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      const stream = await chatWithGeminiStream(textToSend, messages, contextMCQs);
      let accumulatedText = '';
      
      for await (const chunk of stream) {
        accumulatedText += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'model', text: accumulatedText };
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => {
        const updated = [...prev];
        if (updated[updated.length - 1].text === '') {
          updated[updated.length - 1] = { role: 'model', text: "I'm sorry, I encountered an error. Please try again later." };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 z-[110] p-4 bg-[#5A5A40] text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all group border-4 border-white"
        id="chatbot-trigger"
      >
        <Bot className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
        </span>
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9, x: 50 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
            exit={{ opacity: 0, y: 100, scale: 0.9, x: 50 }}
            className="fixed bottom-24 right-8 z-[110] w-[90vw] md:w-[400px] h-[650px] bg-white rounded-3xl shadow-3xl border border-gray-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-[#5A5A40] to-[#4A4A30] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-none">NEET Expert</h3>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-green-400"></span>
                    <span className="text-[10px] text-white/70 font-medium uppercase tracking-wider">Online & Processing</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                id="close-chatbot"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
              {messages.length === 0 && (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 bg-[#5A5A40]/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="w-8 h-8 text-[#5A5A40]" />
                  </div>
                  <h4 className="font-bold text-gray-900 mb-2">How can I help you today?</h4>
                  <p className="text-sm text-gray-500 mb-8">
                    I can explain complex concepts, give you study shortcuts, or help with any NEET doubt.
                  </p>
                  
                  {/* Suggestions Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSend(s.label)}
                        className="flex items-center gap-2 p-3 bg-white border border-gray-100 rounded-2xl text-[11px] font-semibold text-gray-700 hover:border-[#5A5A40] hover:text-[#5A5A40] transition-all text-left shadow-sm"
                      >
                        <s.icon className="w-3.5 h-3.5 shrink-0" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "px-4 py-3 rounded-2xl text-sm leading-relaxed max-w-[90%]",
                      msg.role === 'user' 
                        ? "bg-[#5A5A40] text-white rounded-tr-none shadow-md" 
                        : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-none prose prose-sm prose-slate max-w-full"
                    )}
                  >
                    {msg.role === 'model' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text}
                      </ReactMarkdown>
                    ) : (
                      msg.text
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 px-1">
                    {msg.role === 'model' && <Bot className="w-3 h-3 text-[#5A5A40]" />}
                    <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest">
                      {msg.role === 'user' ? 'Student' : 'NEET Assistant'}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-3 text-[#5A5A40]/70 ml-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-[#5A5A40] rounded-full animate-bounce"></span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Consulting NCERT...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Context Indicator */}
            {contextMCQs && contextMCQs.length > 0 && (
              <div className="px-5 py-2.5 bg-yellow-50/80 backdrop-blur-sm border-y border-yellow-100 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
                <span className="text-[10px] font-bold text-yellow-800 uppercase tracking-tight shrink-0">Live Analysis:</span>
                <span className="text-[10px] text-yellow-700 truncate font-medium italic">
                  Currently viewing {contextMCQs.length} exam-targeted questions
                </span>
              </div>
            )}

            {/* Input Area */}
            <div className="p-5 bg-white border-t border-gray-100 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type your NEET doubt here..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-5 pr-12 py-3.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#5A5A40]/10 focus:border-[#5A5A40]/30 transition-all placeholder:text-gray-400"
                    id="chatbot-input"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center p-2 text-gray-300">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </div>
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  className="p-3.5 bg-[#5A5A40] text-white rounded-2xl shadow-xl shadow-[#5A5A40]/20 hover:scale-105 hover:bg-[#4A4A30] active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all"
                  id="send-chat-message"
                >
                  <Send className="w-5 h-5 translate-x-0.5 -translate-y-0.5" />
                </button>
              </div>
              <div className="mt-3 text-center">
                <span className="text-[9px] text-gray-400 font-medium">NEET AI Expert • Final Year MBBBS Resident Profile</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

