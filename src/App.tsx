/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc,
  doc,
  query, 
  where, 
  getDocs, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { extractTextFromPdf, pdfToImages } from './services/pdfService';
import { generateMCQsFromContent, generateSimilarMCQ, MCQ } from './services/geminiService';
import { generateAIAppBuildPlan } from './services/geminiService';
import { exportMCQsToPdf } from './services/exportService';
import { seedOfficialPapers } from './lib/seeding';
import { ChatBot } from './components/ChatBot';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  FileUp, 
  LayoutDashboard, 
  LogOut, 
  Download, 
  BrainCircuit, 
  ChevronRight, 
  ArrowRight,
  Loader2, 
  CheckCircle2, 
  Search,
  BookOpen,
  Flag,
  AlertTriangle,
  X,
  ExternalLink,
  PlusCircle
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Page = 'landing' | 'dashboard' | 'upload' | 'results' | 'library';

interface MCQSet {
  id: string;
  sourceFileName: string;
  topic: string;
  questions: MCQ[];
  createdAt: any;
  language?: string;
  officialYear?: number;
  isOfficial?: boolean;
  isQuestionBank?: boolean;
}

interface OfficialPaper {
  id: string;
  year: number;
  title: string;
  description?: string;
  pdfUrl?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [papers, setPapers] = useState<OfficialPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [mcqSets, setMcqSets] = useState<MCQSet[]>([]);
  const [communitySets, setCommunitySets] = useState<MCQSet[]>([]);
  const [currentSet, setCurrentSet] = useState<MCQSet | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStatus, setGenStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preSelectedYear, setPreSelectedYear] = useState<number | null>(null);

  // Static fallback list for PYQ Archive (1998 to 2025)
  const defaultArchive: OfficialPaper[] = Array.from({ length: 2025 - 1998 + 1 }, (_, i) => {
    const year = 2025 - i;
    return {
      id: `pyq-${year}`,
      year: year,
      title: `NEET Official Paper ${year}`,
      description: `Original NEET entrance examination paper from the year ${year}.`
    };
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        setCurrentPage('dashboard');
        fetchUserSets(u.uid);
        fetchOfficialPapers();
      } else {
        setCurrentPage('landing');
      }
    });
    return unsubscribe;
  }, []);

  const fetchOfficialPapers = async () => {
    try {
      const q = query(collection(db, 'officialPapers'));
      const snapshot = await getDocs(q);
      const fetchedPapers: OfficialPaper[] = [];
      snapshot.forEach((doc) => {
        fetchedPapers.push({ id: doc.id, ...doc.data() } as OfficialPaper);
      });

      // Merge defaults with database records
      const archiveMap = new Map<number, OfficialPaper>();
      defaultArchive.forEach(p => archiveMap.set(p.year, p));
      
      // Override or add from database
      fetchedPapers.forEach(p => {
        const existing = archiveMap.get(p.year);
        if (existing) {
          archiveMap.set(p.year, { ...existing, ...p });
        } else {
          archiveMap.set(p.year, p);
        }
      });

      const finalArchive = Array.from(archiveMap.values());
      finalArchive.sort((a, b) => b.year - a.year);
      setPapers(finalArchive);
    } catch (err) {
      console.error("Error fetching official papers:", err);
      setPapers(defaultArchive);
    }
  };

  const fetchUserSets = async (uid: string) => {
    try {
      // Fetch user specific sets
      const q = query(
        collection(db, 'mcqSets'),
        where('userId', '==', uid)
      );
      const querySnapshot = await getDocs(q);
      const sets: MCQSet[] = [];
      querySnapshot.forEach((doc) => {
        sets.push({ id: doc.id, ...doc.data() } as MCQSet);
      });
      // Sort in memory to avoid index requirements
      sets.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMcqSets(sets);

      // Fetch official/community sets - Removing orderBy to avoid index requirement for better UX in new projects
      const qOfficial = query(
        collection(db, 'mcqSets'),
        where('isOfficial', '==', true)
      );
      const officialSnapshot = await getDocs(qOfficial);
      const oSets: MCQSet[] = [];
      officialSnapshot.forEach((doc) => {
        oSets.push({ id: doc.id, ...doc.data() } as MCQSet);
      });
      // Sort in memory to avoid index requirements
      oSets.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setCommunitySets(oSets);
    } catch (err) {
      console.error("Error fetching sets:", err);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login Error:", err);
      setError("Failed to sign in. Please try again.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setCurrentPage('landing');
  };

  const handlePdfUpload = async (files: File[], topics?: string, language: string = "English", classLevel: string = "Class 12", officialYear?: number, count: number = 20, difficulty: "Easy" | "Medium" | "Hard" | "NEET Advanced" = "Hard") => {
    if (!user) return;
    setIsGenerating(true);
    setGenProgress(5);
    setGenStatus(`Initializing processing for ${files.length} file(s)...`);
    setError(null);
    try {
      let combinedText = "";
      let combinedImages: { data: string, mimeType: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setGenStatus(`Extracting content from ${file.name} (${i + 1}/${files.length})...`);
        const text = await extractTextFromPdf(file);
        combinedText += `SOURCE: ${file.name}\n${text}\n\n`;
        
        if (text.length < 200) {
          setGenStatus(`Low text density in ${file.name}. capturing images...`);
          const images = await pdfToImages(file, 5); 
          combinedImages = [...combinedImages, ...images];
        }
        setGenProgress(Math.min(5 + ((i + 1) / files.length) * 35, 40));
      }

      setGenProgress(40);
      setGenStatus('Analyzing concepts and multi-file topics...');

      setGenProgress(60);
      setGenStatus(`Generating ${count} ${difficulty} level MCQs from combined source...`);
      const generatedMcqs = await generateMCQsFromContent({ text: combinedText || undefined, images: combinedImages.length > 0 ? combinedImages : undefined }, topics, language, classLevel, officialYear, count, difficulty);
      
      setGenProgress(90);
      setGenStatus('Saving to your library...');
      const setDoc = {
        userId: user.uid,
        sourceFileName: files.map(f => f.name).join(", "),
        topic: topics || (officialYear ? `NEET Official ${officialYear}` : files[0].name.replace('.pdf', '') + (files.length > 1 ? ` + ${files.length - 1} more` : '')),
        questions: generatedMcqs,
        language: language,
        createdAt: serverTimestamp(),
        officialYear: officialYear || null,
        isOfficial: !!officialYear 
      };

      const docRef = await addDoc(collection(db, 'mcqSets'), setDoc);
      // We use serverTime for the local object until refreshed
      const newSet = { 
        id: docRef.id, 
        ...setDoc, 
        createdAt: { toDate: () => new Date() } // Placeholder for immediate feedback
      } as unknown as MCQSet;
      
      setMcqSets([newSet, ...mcqSets]);
      if (newSet.isOfficial) {
        setCommunitySets([newSet, ...communitySets]);
      }
      setGenProgress(100);
      setGenStatus('Complete!');
      setTimeout(() => {
        setCurrentSet(newSet);
        setCurrentPage('results');
        setIsGenerating(false);
      }, 500);
    } catch (err) {
      console.error("Generation Error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate MCQs. Please ensure the PDF is readable.");
      setIsGenerating(false);
    }
  };

  const handleGenerateSimilar = async (referenceMCQ: MCQ, setId: string, forcedLanguage?: string) => {
    if (!user) return;
    try {
      const targetSet = mcqSets.find(s => s.id === setId) || communitySets.find(s => s.id === setId);
      const setLanguage = forcedLanguage || targetSet?.language || "English";
      
      const newMcq = await generateSimilarMCQ(referenceMCQ, setLanguage);
      
      // Update local state
      if (currentSet && currentSet.id === setId) {
        const updatedQuestions = [...currentSet.questions, newMcq];
        const updatedSet = { ...currentSet, questions: updatedQuestions };
        
        setCurrentSet(updatedSet);
        
        // Update mcqSets list
        setMcqSets(mcqSets.map(s => s.id === setId ? updatedSet : s));
        
        // Update Firebase
        const setRef = doc(db, 'mcqSets', setId);
        await updateDoc(setRef, {
          questions: updatedQuestions
        });
      }
    } catch (err) {
      console.error("Error generating similar MCQ:", err);
      setError("Failed to generate a follow-up question. Please try again.");
    }
  };

  const handleMergeSet = async (selectedSetIds: string[], bankName: string) => {
    if (!user || selectedSetIds.length === 0) return;
    setIsGenerating(true);
    setGenProgress(30);
    setGenStatus('Merging question sources...');
    try {
      const allSourceSets = [...mcqSets, ...communitySets];
      const questionsToMerge: MCQ[] = [];
      const sources: string[] = [];

      selectedSetIds.forEach(id => {
        const set = allSourceSets.find(s => s.id === id);
        if (set) {
          questionsToMerge.push(...set.questions);
          sources.push(set.topic);
        }
      });

      // Simple shuffle to make it a test
      const shuffled = [...questionsToMerge].sort(() => Math.random() - 0.5);

      const setDoc = {
        userId: user.uid,
        sourceFileName: "Combined Question Bank",
        topic: bankName || `Question Bank: ${sources.join(", ")}`,
        questions: shuffled,
        createdAt: serverTimestamp(),
        isOfficial: false,
        isQuestionBank: true
      };

      const docRef = await addDoc(collection(db, 'mcqSets'), setDoc);
      const newSet = { 
        id: docRef.id, 
        ...setDoc, 
        createdAt: { toDate: () => new Date() } 
      } as unknown as MCQSet;
      
      setMcqSets([newSet, ...mcqSets]);
      setCurrentSet(newSet);
      setCurrentPage('results');
      setIsGenerating(false);
    } catch (err) {
      console.error("Merge Error:", err);
      setError("Failed to create question bank.");
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1a1a1a] font-sans">
      {user && (
        <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-[#5A5A40]/10 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setCurrentPage('dashboard')}
            >
              <BrainCircuit className="w-6 h-6 text-[#5A5A40]" />
              <span className="font-semibold text-lg tracking-tight">NEET MCQ Generator</span>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setCurrentPage('dashboard')}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-[#5A5A40]",
                  currentPage === 'dashboard' ? "text-[#5A5A40]" : "text-gray-500"
                )}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setCurrentPage('library')}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-[#5A5A40]",
                  currentPage === 'library' ? "text-[#5A5A40]" : "text-gray-500"
                )}
              >
                PYQ Archive
              </button>
              <button 
                onClick={() => setCurrentPage('upload')}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-[#5A5A40]",
                  currentPage === 'upload' ? "text-[#5A5A40]" : "text-gray-500"
                )}
              >
                New Generator
              </button>
              <div className="h-6 w-px bg-gray-200" />
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
      )}

      <main className={cn("max-w-7xl mx-auto px-4 pt-24 pb-12", !user && "pt-0")}>
        <AnimatePresence mode="wait">
          {currentPage === 'landing' && (
            <LandingPage key="landing" onLogin={handleLogin} />
          )}

          {currentPage === 'dashboard' && (
            <Dashboard 
              key="dashboard"
              sets={mcqSets} 
              onSelectSet={(set) => {
                setCurrentSet(set);
                setCurrentPage('results');
              }}
              onNew={() => setCurrentPage('upload')}
              onViewLibrary={() => setCurrentPage('library')}
            />
          )}

          {currentPage === 'upload' && (
            <UploadPage 
              key="upload"
              onUpload={handlePdfUpload}
              onMerge={handleMergeSet}
              existingSets={mcqSets}
              isGenerating={isGenerating}
              progress={genProgress}
              status={genStatus}
              error={error}
              initialYear={preSelectedYear || undefined}
            />
          )}

          {currentPage === 'library' && (
            <LibraryPage 
              key="library"
              papers={papers}
              communitySets={communitySets}
              onSelect={(p) => {
                const existing = communitySets.find(s => s.officialYear === p.year);
                if (existing) {
                  setCurrentSet(existing);
                  setCurrentPage('results');
                } else {
                  setPreSelectedYear(p.year);
                  setCurrentPage('upload');
                }
              }}
            />
          )}

          {currentPage === 'results' && currentSet && (
            <ResultsPage 
              key="results"
              mcqSet={currentSet} 
              onDownload={() => exportMCQsToPdf(currentSet.topic, currentSet.questions)}
              onGenerateSimilar={handleGenerateSimilar}
            />
          )}
        </AnimatePresence>
      </main>

      {user && (
        <a 
          href="https://drive.google.com/drive/folders/14OHtvC7ywZMDVFn1-VjYVAcwR1XJYDga?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-8 right-8 z-[100] flex items-center gap-3 bg-white/90 backdrop-blur-sm px-5 py-3 rounded-2xl border border-[#5A5A40]/20 shadow-2xl hover:bg-[#5A5A40] hover:text-white transition-all group active:scale-95"
          id="drive-download-link"
        >
          <div className="bg-blue-50 group-hover:bg-white/20 p-2 rounded-xl transition-colors">
            <ExternalLink className="w-5 h-5 text-blue-600 group-hover:text-white" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-white/70 leading-none mb-1">Legacy Archive</span>
            <span className="text-[12px] font-black tracking-tight leading-none uppercase">NEET Practice Previous Old Paper Download</span>
          </div>
        </a>
      )}
      {user && <ChatBot contextMCQs={currentSet?.questions} />}
    </div>
  );
}

// --- Page Components ---

function LandingPage({ onLogin }: { onLogin: () => void, key?: string }) {
  const [idea, setIdea] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [platform, setPlatform] = useState('Web + Mobile');
  const [monetization, setMonetization] = useState('');
  const [timeline, setTimeline] = useState('8 weeks');
  const [plan, setPlan] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const handleGeneratePlan = async () => {
    if (!idea.trim()) {
      setPlanError('Please enter your app idea to generate a build plan.');
      return;
    }

    setIsPlanning(true);
    setPlanError(null);

    try {
      const generatedPlan = await generateAIAppBuildPlan({
        idea,
        targetUsers,
        platform,
        monetization,
        timeline
      });
      setPlan(generatedPlan);
    } catch (err) {
      console.error(err);
      setPlanError('Failed to generate AI app build plan. Please try again.');
    } finally {
      setIsPlanning(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen flex flex-col items-center justify-center text-center px-4"
    >
      <div className="mb-8 p-4 bg-white rounded-3xl shadow-xl shadow-[#5A5A40]/5">
        <BrainCircuit className="w-16 h-16 text-[#5A5A40]" />
      </div>
      <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6">
        NEET MCQ <br />
        <span className="text-[#5A5A40]">Generator.</span>
      </h1>
      <p className="text-xl text-gray-500 max-w-2xl mb-12 leading-relaxed">
        Upload your PDFs and let our AI generate standard NEET-level MCQs 
        with conceptual depth. No repetitions, just pure learning.
      </p>
      <button 
        onClick={onLogin}
        className="px-8 py-4 bg-[#5A5A40] text-white rounded-full text-lg font-medium shadow-2xl shadow-[#5A5A40]/20 hover:scale-105 transition-transform flex items-center gap-3"
      >
        Sign in to Start Generating
        <ChevronRight className="w-5 h-5" />
      </button>
      
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl text-left">
        {[
          { icon: CheckCircle2, title: "NEET Difficulty", desc: "Maintains official expert-level questioning standards." },
          { icon: LayoutDashboard, title: "Instant Sets", desc: "Generate 50+ questions from a single PDF in seconds." },
          { icon: Download, title: "Export to PDF", desc: "Download high-quality question banks with answer keys." }
        ].map((feat, i) => (
          <div key={i} className="p-6 bg-white rounded-2xl border border-gray-100">
            <feat.icon className="w-8 h-8 text-[#5A5A40] mb-4" />
            <h3 className="font-semibold mb-2">{feat.title}</h3>
            <p className="text-sm text-gray-500">{feat.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 w-full max-w-5xl bg-white rounded-3xl border border-gray-100 p-8 text-left shadow-xl shadow-[#5A5A40]/5">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <h3 className="text-2xl font-bold tracking-tight">Full AI App Build Assistant</h3>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#5A5A40] bg-[#5A5A40]/10 px-3 py-1 rounded-full">
            New
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Describe your idea and get an end-to-end AI product build roadmap (MVP scope, architecture, stack, and execution plan).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Example: Build an AI study coach that personalizes daily revision plans from students' weak topics."
            className="md:col-span-2 min-h-28 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#5A5A40]/10 focus:border-[#5A5A40]/30"
          />
          <input
            value={targetUsers}
            onChange={(e) => setTargetUsers(e.target.value)}
            placeholder="Target users (e.g., NEET students in Class 11/12)"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#5A5A40]/10 focus:border-[#5A5A40]/30"
          />
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="Platform (e.g., Web, Android, iOS)"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#5A5A40]/10 focus:border-[#5A5A40]/30"
          />
          <input
            value={monetization}
            onChange={(e) => setMonetization(e.target.value)}
            placeholder="Monetization (e.g., Freemium + Pro subscription)"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#5A5A40]/10 focus:border-[#5A5A40]/30"
          />
          <input
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            placeholder="Timeline goal (e.g., MVP in 8 weeks)"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#5A5A40]/10 focus:border-[#5A5A40]/30"
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleGeneratePlan}
            disabled={isPlanning}
            className="px-5 py-3 bg-[#5A5A40] text-white rounded-full text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
          >
            {isPlanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
            {isPlanning ? 'Building plan...' : 'Generate full AI app build plan'}
          </button>
          {planError && <span className="text-sm text-red-500">{planError}</span>}
        </div>

        {plan && (
          <div className="mt-8 rounded-2xl border border-gray-100 p-6 bg-gray-50 prose prose-sm max-w-none">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        )}
      </div>

      <p className="mt-16 text-[10px] font-bold text-gray-300 uppercase tracking-[0.3em]">
        Designed and Built by Ram
      </p>
    </motion.div>
  );
}

function Dashboard({ sets, onSelectSet, onNew, onViewLibrary }: { 
  sets: MCQSet[], 
  onSelectSet: (s: MCQSet) => void, 
  onNew: () => void,
  onViewLibrary: () => void,
  key?: string
}) {
  const handleSeed = async () => {
    try {
      await seedOfficialPapers();
      alert("Official paper metadata organized! Refreshing listing...");
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="p-8 bg-[#5A5A40] rounded-[2rem] text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-[#5A5A40]/30 overflow-hidden relative">
        <div className="relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Official PYQ Archive</h2>
          <p className="text-[#F5F5F0]/70 max-w-lg mb-6">
            Access the last 20 years of official NEET papers. Study patterns, repeated concepts, and expert benchmarks.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={onViewLibrary}
              className="px-6 py-3 bg-white text-[#5A5A40] rounded-full font-bold text-sm hover:scale-105 transition-transform"
            >
              Explore Archive
            </button>
            <button 
              onClick={handleSeed}
              className="px-6 py-3 bg-[#5A5A40]/50 text-white rounded-full font-bold text-[10px] border border-white/20 hover:bg-white/10 transition-colors"
            >
              INITIALIZE ARCHIVE (Once)
            </button>
          </div>
          <div className="mt-4 text-[10px] font-medium text-white/40 uppercase tracking-[0.2em]">
            Developed by <span className="text-white/80">Ram</span>
          </div>
        </div>
        <div className="relative z-10 opacity-20">
          <BookOpen className="w-48 h-48 -rotate-12" />
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Your Question Banks</h2>
          <p className="text-gray-500">View and manage your AI-generated NEET preparations.</p>
        </div>
        <button 
          onClick={onNew}
          className="px-6 py-2.5 bg-[#5A5A40] text-white rounded-full font-medium hover:opacity-90 transition-opacity"
        >
          Generate New
        </button>
      </div>

      {sets.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-200">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900">No question sets yet</h3>
          <p className="text-gray-500 mt-2">Upload your first PDF to generate NEET MCQs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sets.map((set) => (
            <motion.div 
              key={set.id}
              whileHover={{ y: -4 }}
              onClick={() => onSelectSet(set)}
              className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-gray-50 rounded-xl">
                  {set.isQuestionBank ? (
                    <BookOpen className="w-6 h-6 text-indigo-600" />
                  ) : (
                    <FileUp className="w-6 h-6 text-[#5A5A40]" />
                  )}
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-gray-100 rounded-md text-gray-500">
                  {set.questions.length} MCQs
                </span>
              </div>
              <h3 className="font-bold text-lg mb-1 group-hover:text-[#5A5A40] transition-colors line-clamp-1">
                {set.isQuestionBank && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full mr-2 uppercase tracking-tighter">Bank</span>}
                {set.topic}
              </h3>
              <p className="text-sm text-gray-400 mb-4 truncate italic">
                From: {set.sourceFileName}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{set.createdAt?.toDate ? set.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  View Questions <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function UploadPage({ onUpload, onMerge, existingSets, isGenerating, progress, status, error, initialYear }: { 
  onUpload: (files: File[], topics?: string, language?: string, classLevel?: string, year?: number, count?: number, difficulty?: any) => void, 
  onMerge: (setIds: string[], name: string) => void,
  existingSets: MCQSet[],
  isGenerating: boolean, 
  progress: number, 
  status: string, 
  error: string | null, 
  initialYear?: number, 
  key?: string | number 
}) {
  const [activeTab, setActiveTab] = useState<'upload' | 'bank'>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedBankSets, setSelectedBankSets] = useState<string[]>([]);
  const [bankName, setBankName] = useState('');
  
  const [topics, setTopics] = useState('');
  const [language, setLanguage] = useState('English');
  const [classLevel, setClassLevel] = useState('Class 12');
  const [mcqCount, setMcqCount] = useState(20);
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard" | "NEET Advanced">("Hard");
  const [selectedYear, setSelectedYear] = useState<number | undefined>(initialYear);

  const languages = ["English", "Hindi", "Marathi", "Tamil", "Telegu", "Bengali", "Gujarati", "Kannada"];
  const classes = ["Class 11", "Class 12"];
  const counts = [5, 10, 15, 20, 30, 45, 100, 200, 500, 1000];
  const difficulties = ["Easy", "Medium", "Hard", "NEET Advanced"];

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      setSelectedFiles(prev => [...prev, ...files]);
    },
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: isGenerating
  });

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleBankSet = (id: string) => {
    setSelectedBankSets(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-3xl mx-auto"
    >
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold tracking-tight mb-4">Content Source</h2>
        <div className="flex items-center justify-center gap-2 p-1 bg-gray-100 rounded-2xl w-fit mx-auto border border-gray-200">
          <button 
            onClick={() => setActiveTab('upload')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === 'upload' ? "bg-white text-[#5A5A40] shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
          >
            New PDF Analysis
          </button>
          <button 
            onClick={() => setActiveTab('bank')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === 'bank' ? "bg-white text-[#5A5A40] shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Question Bank Builder
          </button>
        </div>
      </div>

      {activeTab === 'upload' ? (
        <div className="space-y-6">
          {selectedFiles.length === 0 ? (
            <div 
              {...getRootProps()} 
              className={cn(
                "relative aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-all cursor-pointer",
                isDragActive ? "border-[#5A5A40] bg-[#5A5A40]/5" : "border-gray-200 bg-white hover:border-[#5A5A40]/50"
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center text-center px-8">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-6">
                  <FileUp className="w-8 h-8 text-[#5A5A40]" />
                </div>
                <p className="text-xl font-medium mb-2">Drop your PDF(s) here</p>
                <p className="text-gray-400 font-medium">Analyze multiple files at once</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-[#5A5A40]/5">
              <div className="mb-8 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Selected Files ({selectedFiles.length})</h3>
                  <button 
                    {...getRootProps()}
                    disabled={isGenerating}
                    className="text-xs font-black uppercase text-[#5A5A40] flex items-center gap-1 hover:underline"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add More
                  </button>
                  <input {...getInputProps()} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileUp className="w-4 h-4 text-[#5A5A40] shrink-0" />
                        <span className="text-sm font-bold truncate">{file.name}</span>
                      </div>
                      {!isGenerating && (
                        <button onClick={() => removeFile(i)} className="p-1 hover:bg-red-50 text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Target Language</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isGenerating} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all cursor-pointer">
                    {languages.map(lang => (<option key={lang} value={lang}>{lang}</option>))}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Difficulty</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)} disabled={isGenerating} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all cursor-pointer">
                    {difficulties.map(d => (<option key={d} value={d}>{d}</option>))}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Questions</label>
                  <select value={mcqCount} onChange={(e) => setMcqCount(Number(e.target.value))} disabled={isGenerating} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all cursor-pointer">
                    {counts.map(c => (<option key={c} value={c}>{c} New MCQs</option>))}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Class</label>
                  <select value={classLevel} onChange={(e) => setClassLevel(e.target.value)} disabled={isGenerating} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all cursor-pointer">
                    {classes.map(cl => (<option key={cl} value={cl}>{cl}</option>))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Focus Topics Override (Optional)</label>
                <textarea 
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  placeholder="Tell AI to only focus on specific parts of these files..."
                  className="w-full h-[80px] p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all resize-none font-medium"
                  disabled={isGenerating}
                />
              </div>

              <button 
                onClick={() => onUpload(selectedFiles, topics, language, classLevel, selectedYear, mcqCount, difficulty)}
                disabled={isGenerating || selectedFiles.length === 0}
                className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-[#5A5A40]/20"
              >
                {isGenerating ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {status}</>
                ) : (
                  <><BrainCircuit className="w-5 h-5" /> Generate from {selectedFiles.length} File(s)</>
                )}
              </button>

              {isGenerating && (
                <div className="mt-8 space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-[#5A5A40] animate-pulse">{status}</span>
                    <span className="text-xs font-black tabular-nums text-[#5A5A40]/50">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-[#5A5A40] transition-all duration-300 ease-out" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-[#5A5A40]/5">
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Question Bank Name</label>
              <input 
                type="text" 
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Grand Mock Test - April 2026"
                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all"
              />
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Select Sources to Merge</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {existingSets.filter(s => !s.isQuestionBank).map(set => (
                  <div 
                    key={set.id}
                    onClick={() => toggleBankSet(set.id)}
                    className={cn(
                      "p-4 rounded-2xl border cursor-pointer transition-all flex flex-col gap-1",
                      selectedBankSets.includes(set.id) 
                        ? "bg-[#5A5A40]/10 border-[#5A5A40] ring-1 ring-[#5A5A40]" 
                        : "bg-gray-50 border-gray-100 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold truncate pr-2">{set.topic}</span>
                      {selectedBankSets.includes(set.id) && <CheckCircle2 className="w-4 h-4 text-[#5A5A40] shrink-0" />}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                      <span>{set.questions.length} MCQs</span>
                      <span>{set.createdAt?.toDate ? set.createdAt.toDate().toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={() => onMerge(selectedBankSets, bankName)}
              disabled={isGenerating || selectedBankSets.length === 0}
              className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-[#5A5A40]/20 mt-4"
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Merging...</>
              ) : (
                <><PlusCircle className="w-5 h-5" /> Compile {selectedBankSets.length} Sets into Test</>
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center border border-red-100">
          {error}
        </motion.div>
      )}
    </motion.div>
  );
}

function ResultsPage({ mcqSet, onDownload, onGenerateSimilar }: { mcqSet: MCQSet, onDownload: () => void, onGenerateSimilar: (mcq: MCQ, setId: string, forcedLanguage?: string) => Promise<void>, key?: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  
  const filteredQuestions = mcqSet.questions.filter(q => 
    q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.concept.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const correctCount = mcqSet.questions.reduce((acc, q, idx) => {
    return acc + (userAnswers[idx] === q.correctAnswer ? 1 : 0);
  }, 0);

  const scoredPoints = mcqSet.questions.reduce((acc, q, idx) => {
    return acc + (userAnswers[idx] === q.correctAnswer ? (q.points || 0) : 0);
  }, 0);

  const totalPossiblePoints = mcqSet.questions.reduce((acc, q) => acc + (q.points || 0), 0);

  const answeredCount = Object.keys(userAnswers).length;
  const scorePercentage = mcqSet.questions.length > 0 
    ? Math.round((correctCount / mcqSet.questions.length) * 100) 
    : 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-[#5A5A40] font-medium mb-2 uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" />
            Set Generated Successfully
          </div>
          <h2 className="text-4xl font-bold tracking-tight">{mcqSet.topic}</h2>
          <p className="text-gray-500 mt-1">Found {mcqSet.questions.length} questions. You've answered {answeredCount}.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSummary(!showSummary)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all shadow-sm",
              showSummary ? "bg-[#5A5A40] text-white" : "bg-white border border-[#5A5A40] text-[#5A5A40]"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            {showSummary ? "Back to Questions" : "Show Scorecard"}
          </button>
          <button 
            onClick={onDownload}
            className="flex items-center gap-2 px-6 py-2.5 bg-white border border-[#5A5A40] text-[#5A5A40] rounded-full font-medium hover:bg-[#5A5A40] hover:text-white transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSummary && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6"
          >
            <div className="md:col-span-1 bg-white p-8 rounded-3xl border border-gray-100 shadow-xl flex flex-col items-center justify-center text-center">
              <div className="relative w-32 h-32 flex items-center justify-center mb-4">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    fill="transparent"
                    stroke="#F3F4F6"
                    strokeWidth="8"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="58"
                    fill="transparent"
                    stroke="#5A5A40"
                    strokeWidth="8"
                    strokeDasharray={364}
                    strokeDashoffset={364 - (364 * scorePercentage) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{scorePercentage}%</span>
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Accuracy</span>
                </div>
              </div>
              <p className="text-sm font-medium text-gray-500">Overall Performance</p>
            </div>

            <div className="md:col-span-3 bg-white p-8 rounded-3xl border border-gray-100 shadow-xl grid grid-cols-1 sm:grid-cols-4 gap-6">
              {[
                { label: "Points Earned", value: scoredPoints, icon: LayoutDashboard, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Correct Answers", value: correctCount, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
                { label: "Incorrect Answers", value: answeredCount - correctCount, icon: BrainCircuit, color: "text-red-600", bg: "bg-red-50" },
                { label: "Total Questions", value: mcqSet.questions.length, icon: BookOpen, color: "text-[#5A5A40]", bg: "bg-[#F5F5F0]" }
              ].map((stat, i) => (
                <div key={i} className="flex flex-col items-start p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <stat.icon className={StatCn(stat.color, "w-6 h-6 mb-2")} />
                  <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">{stat.label}</span>
                  <span className="text-3xl font-bold mt-1">{stat.value}</span>
                </div>
              ))}
              <div className="sm:col-span-3 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500 italic">
                  * Performance is calculated based on answered questions only. Keep practicing to improve your conceptual clarity!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showSummary && (
        <>
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Filter by keyword or concept..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-gray-100 rounded-full text-sm outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all w-full"
            />
          </div>
          
          <div className="space-y-6">
            {filteredQuestions.map((q, i) => (
              <QuestionCard 
                key={i} 
                question={q} 
                index={i + 1} 
                setId={mcqSet.id}
                userAnswer={userAnswers[i]}
                onSelect={(ans) => setUserAnswers(prev => ({ ...prev, [i]: ans }))}
                onGenerateSimilar={onGenerateSimilar}
                setLanguage={mcqSet.language || 'English'}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

function StatCn(...inputs: (string | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}

function QuestionCard({ question, index, userAnswer, onSelect, setId, onGenerateSimilar, setLanguage }: { question: MCQ, index: number, userAnswer?: string, onSelect: (ans: string) => void, setId: string, onGenerateSimilar: (mcq: MCQ, setId: string, forcedLanguage?: string) => Promise<void>, setLanguage: string, key?: string | number }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [isGeneratingSimilar, setIsGeneratingSimilar] = useState(false);
  const [selectedGenLanguage, setSelectedGenLanguage] = useState(setLanguage);
  const [isFlagging, setIsFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState('Incorrect Explanation');
  const [flagComment, setFlagComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const isCorrect = userAnswer === question.correctAnswer;

  const handleFlag = async () => {
    if (!auth.currentUser) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'questionFeedback'), {
        userId: auth.currentUser.uid,
        setId,
        questionIndex: index - 1,
        reason: flagReason,
        comment: flagComment,
        createdAt: serverTimestamp()
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsFlagging(false);
        setIsSuccess(false);
        setFlagComment('');
      }, 2000);
    } catch (err) {
      console.error("Flag Error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm relative overflow-hidden">
      {userAnswer && (
        <div className={cn(
          "absolute top-0 right-0 w-2 h-full",
          isCorrect ? "bg-green-500" : "bg-red-500"
        )} />
      )}
      
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4 flex-1">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 text-[#5A5A40] flex items-center justify-center font-bold text-sm border border-gray-100">
            {index}
          </span>
          <div className="space-y-6 flex-1">
            <h3 className="text-xl font-semibold leading-snug">{question.question}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {question.options.map((option, idx) => {
                const isSelected = userAnswer === option;
                const isActuallyCorrect = option === question.correctAnswer;
                
                let variantClass = "border-gray-100 hover:border-[#5A5A40]/30 hover:bg-gray-50";
                if (userAnswer) {
                  if (isActuallyCorrect) variantClass = "bg-green-50 border-green-200 text-green-900 ring-1 ring-green-500 ring-offset-2";
                  else if (isSelected) variantClass = "bg-red-50 border-red-200 text-red-900 ring-1 ring-red-500 ring-offset-2";
                  else variantClass = "opacity-50 border-gray-100 grayscale-[0.5]";
                }

                return (
                  <button 
                    key={idx}
                    disabled={!!userAnswer}
                    onClick={() => onSelect(option)}
                    className={cn(
                      "p-5 rounded-2xl border text-left text-sm transition-all relative group flex items-center",
                      variantClass
                    )}
                  >
                    <span className="font-bold mr-4 text-xs opacity-40">{String.fromCharCode(65 + idx)}</span>
                    <span className="flex-1 font-medium">{option}</span>
                    {userAnswer && isActuallyCorrect && (
                      <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 ml-2" />
                    )}
                    {isSelected && !isCorrect && (
                      <BrainCircuit className="w-5 h-5 text-red-600 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 ml-6">
          <button 
            onClick={() => setIsFlagging(true)}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Flag for Review"
          >
            <Flag className="w-4 h-4" />
          </button>
          <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
            {question.points || 0} Points
          </span>
          <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-md border border-yellow-200">
            {question.difficulty}
          </span>
          <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200 text-right max-w-[120px] truncate">
            {question.concept}
          </span>
        </div>
      </div>

      <AnimatePresence>
        {isFlagging && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-red-50 p-6 rounded-2xl border border-red-100 mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-widest">
                  <AlertTriangle className="w-4 h-4" />
                  Flag Question for Review
                </div>
                <button onClick={() => setIsFlagging(false)} className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isSuccess ? (
                <div className="py-4 text-center text-red-700 font-medium">
                  Thank you! Your feedback has been submitted for review.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-red-900/50">Reason</label>
                      <select 
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        className="w-full p-3 bg-white border border-red-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                      >
                        <option>Incorrect Explanation</option>
                        <option>Ambiguous Question</option>
                        <option>Wrong Options</option>
                        <option>Not NEET Level</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-red-900/50">Comment (Optional)</label>
                      <input 
                        type="text" 
                        value={flagComment}
                        onChange={(e) => setFlagComment(e.target.value)}
                        placeholder="Explain briefly..."
                        className="w-full p-3 bg-white border border-red-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleFlag}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Flag"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(userAnswer || showExplanation) && (
        <div className="border-t border-gray-100 pt-6 mt-4 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {!showExplanation ? (
              <button 
                onClick={() => setShowExplanation(true)}
                className="text-xs font-bold text-[#5A5A40] underline underline-offset-4 flex items-center gap-2 hover:opacity-70 transition-all"
              >
                See Conceptual Explanation
                <ChevronRight className="w-3 h-3" />
              </button>
            ) : (
              <button 
                onClick={() => setShowExplanation(false)}
                className="text-xs font-bold text-[#5A5A40] underline underline-offset-4 flex items-center gap-2 hover:opacity-70 transition-all"
              >
                Hide Conceptual Explanation
                <ChevronRight className="w-3 h-3 rotate-180" />
              </button>
            )}

            {userAnswer && (
              <div className="flex items-center gap-2">
                <select 
                  value={selectedGenLanguage}
                  onChange={(e) => setSelectedGenLanguage(e.target.value)}
                  className="bg-white border border-gray-100 rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#5A5A40] outline-none shadow-sm"
                >
                  {["English", "Hindi", "Marathi", "Tamil", "Telegu", "Bengali", "Gujarati", "Kannada"].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <button 
                  onClick={async () => {
                    setIsGeneratingSimilar(true);
                    await onGenerateSimilar(question, setId, selectedGenLanguage);
                    setIsGeneratingSimilar(false);
                  }}
                  disabled={isGeneratingSimilar}
                  className="flex items-center gap-2 px-4 py-2 bg-[#5A5A40]/5 text-[#5A5A40] rounded-xl text-xs font-bold hover:bg-[#5A5A40] hover:text-white transition-all disabled:opacity-50 shadow-sm whitespace-nowrap"
                >
                  {isGeneratingSimilar ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <PlusCircle className="w-3 h-3" />
                  )}
                  Similar Question
                </button>
              </div>
            )}
          </div>

          {showExplanation && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="overflow-hidden"
            >
              <div className="p-6 bg-[#F5F5F0] rounded-2xl text-sm leading-relaxed text-gray-700 border border-[#5A5A40]/10">
                <div className="flex items-center gap-2 mb-3">
                  <BrainCircuit className="w-4 h-4 text-[#5A5A40]" />
                  <p className="font-bold text-[#1a1a1a] text-xs uppercase tracking-widest">Mastery Breakdown</p>
                </div>
                {question.explanation}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryPage({ papers, communitySets, onSelect }: { papers: OfficialPaper[], communitySets: MCQSet[], onSelect: (p: OfficialPaper) => void, key?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider mb-4 border border-green-100">
          <CheckCircle2 className="w-3 h-3" />
          Official Resource Library (Free Access)
        </div>
        <h2 className="text-4xl font-bold tracking-tight mb-4 text-[#5A5A40]">NEET Year-wise Archive</h2>
        <p className="text-gray-500">
          A permanent collection of official NEET papers from 1998 to 2025. 
          Select a year to instantly access active papers or contribute a new set for the community.
        </p>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 divide-y divide-gray-50">
          {papers.map((p) => {
            const isFilled = communitySets.some(s => s.officialYear === p.year);
            
            return (
              <div 
                key={p.id}
                onClick={() => onSelect(p)}
                className="group p-6 hover:bg-[#F5F5F0]/30 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-8">
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex flex-col items-center justify-center border transition-all",
                    isFilled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-100 group-hover:bg-white group-hover:border-[#5A5A40]/20"
                  )}>
                    <span className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-[#5A5A40]/50 transition-colors">Year</span>
                    <span className={cn("text-xl font-black", isFilled ? "text-green-700" : "text-[#5A5A40]")}>{p.year}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#5A5A40] transition-colors">{p.title}</h3>
                    <div className="flex items-center gap-4 mt-0.5">
                      <p className="text-sm text-gray-400">
                        {isFilled ? "Paper is active and ready for practice" : p.description}
                      </p>
                      {p.pdfUrl && (
                        <a 
                          href={p.pdfUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          ORIGINAL PDF
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden sm:flex flex-col items-end">
                    {isFilled ? (
                      <span className="text-[10px] uppercase font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">Active Paper</span>
                    ) : p.pdfUrl ? (
                      <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">PDF Available</span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">Ready for Selection</span>
                    )}
                    <span className="text-[10px] text-gray-300 mt-1 uppercase tracking-tight">Verified Official Source</span>
                  </div>
                  <button className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all ring-offset-2 focus:ring-2",
                    isFilled ? "bg-green-600 text-white shadow-lg shadow-green-200" : "bg-gray-50 text-gray-400 group-hover:bg-[#5A5A40] group-hover:text-white ring-[#5A5A40]"
                  )}>
                    {isFilled ? <BrainCircuit className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
