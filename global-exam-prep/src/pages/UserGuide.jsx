import React from 'react';
import { motion } from 'framer-motion';
import { 
    BookOpen, Search, Compass, Zap, Cpu, UploadCloud, 
    FileText, Shield, Clock, BarChart3, TrendingUp, History,
    CheckCircle2
} from 'lucide-react';
import './UserGuide.css';

const faqs = [
    {
        q: "How does the AI auto-generate exams?",
        a: "PrepMaster uses an advanced language model (like Llama-3) to analyze your selected subject's syllabus and standard curriculum data, crafting challenging and relevant questions."
    },
    {
        q: "What format should my uploaded PDFs be?",
        a: "For the 'Upload PDF' mode, standard text-based PDFs work best. The system will extract the text and generate a custom quiz based strictly on the uploaded content."
    },
    {
        q: "How is my performance tracked?",
        a: "Every exam you complete is saved securely to your Dashboard. You can review past answers, see how long you spent, and track your overall accuracy across different difficulty levels."
    }
];

export default function UserGuide() {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { 
            opacity: 1,
            transition: { staggerChildren: 0.15, ease: "easeOut" }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: { 
            opacity: 1, y: 0,
            transition: { type: "spring", stiffness: 100, damping: 15 }
        }
    };

    return (
        <div className="guide-container">
            {/* Background elements */}
            <div className="bg-glow-sphere shape-1"></div>
            <div className="bg-glow-sphere shape-2"></div>
            
            {/* Header */}
            <header className="guide-header">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="guide-icon-wrapper"
                >
                    <Compass size={40} className="guide-icon" />
                </motion.div>
                <motion.h1 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="guide-title"
                >
                    Master Your Exams
                </motion.h1>
                <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="guide-subtitle"
                >
                    The ultimate guide to unlocking PrepMaster's full potential and acing your university courses.
                </motion.p>
            </header>

            {/* Main Content Sections */}
            <motion.main 
                className="guide-grid"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Section 1: Finding Courses */}
                <motion.section className="guide-card" variants={itemVariants}>
                    <div className="card-header">
                        <div className="card-icon blue"><Search size={24} /></div>
                        <h2>1. Explore Courses & Subjects</h2>
                    </div>
                    <div className="card-content">
                        <p>Finding your exact curriculum is the first step.</p>
                        <ul className="feature-list">
                            <li><CheckCircle2 size={16} /> <strong>Global Search:</strong> Use the search bar in the navigation to instantly jump to your subject.</li>
                            <li><CheckCircle2 size={16} /> <strong>Domain Browsing:</strong> Click on your academic domain (Engineering, Business, Medical) from the homepage, then select your specific course and semester.</li>
                        </ul>
                    </div>
                </motion.section>

                {/* Section 2: AI Exam Generation Modes */}
                <motion.section className="guide-card span-2" variants={itemVariants}>
                     <div className="card-header">
                        <div className="card-icon purple"><Zap size={24} /></div>
                        <h2>2. Choose Your Exam Generation Mode</h2>
                    </div>
                    <div className="card-content">
                        <p>We offer three powerful methods to create your custom exam environment.</p>
                        <div className="mode-grid">
                            <div className="mode-box">
                                <Cpu size={28} className="mode-icon purple" />
                                <h3>Auto AI Generation</h3>
                                <p>Simply click "Generate Questions". PrepMaster uses the standard AICTE/UGC university syllabus context to automatically build a highly accurate exam.</p>
                            </div>
                            <div className="mode-box">
                                <FileText size={28} className="mode-icon green" />
                                <h3>Paste Text / Notes</h3>
                                <p>Got your own study notes? Paste them directly into the custom text box. The AI will read your notes and generate questions specifically testing that material.</p>
                            </div>
                            <div className="mode-box">
                                <UploadCloud size={28} className="mode-icon blue" />
                                <h3>Upload PDF / PPT</h3>
                                <p>Upload a lecture slide deck or syllabus PDF. Our local parser extracts the text, ensuring your exam covers exactly what your professor taught.</p>
                            </div>
                        </div>
                    </div>
                </motion.section>

                {/* Section 3: The Exam Environment */}
                <motion.section className="guide-card" variants={itemVariants}>
                    <div className="card-header">
                        <div className="card-icon orange"><Shield size={24} /></div>
                        <h2>3. The Exam Environment</h2>
                    </div>
                    <div className="card-content">
                        <p>Our exam portal simulates high-stakes testing.</p>
                        <ul className="feature-list">
                            <li><Clock size={16} /> <strong>Timed Sessions:</strong> Every exam holds a strict countdown timer to practice pacing.</li>
                            <li><Shield size={16} /> <strong>Anti-Cheat Active:</strong> Navigating away from the tab or right-clicking will trigger a warning. Stay focused!</li>
                            <li><BookOpen size={16} /> <strong>Objective & Subjective:</strong> Train with standard MCQs or tackle in-depth theory questions.</li>
                        </ul>
                    </div>
                </motion.section>

                {/* Section 4: Performance Tracking */}
                <motion.section className="guide-card" variants={itemVariants}>
                    <div className="card-header">
                        <div className="card-icon green"><BarChart3 size={24} /></div>
                        <h2>4. Review & Analytics</h2>
                    </div>
                    <div className="card-content">
                        <p>Improvement requires analyzing your mistakes.</p>
                        <ul className="feature-list">
                            <li><History size={16} /> <strong>Dashboard History:</strong> View every exam you've ever taken in the secure dashboard.</li>
                            <li><TrendingUp size={16} /> <strong>Detailed Review:</strong> Re-open past exams to see correct answers versus your selections, and read full AI-generated explanations.</li>
                        </ul>
                        <div className="dashboard-cta">
                            <button onClick={() => window.location.href='/dashboard'} className="btn-primary">View Your Dashboard</button>
                        </div>
                    </div>
                </motion.section>
            </motion.main>

            {/* FAQ Section */}
            <motion.section 
                className="faq-section"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6 }}
            >
                <div className="faq-header">
                    <h2>Frequently Asked Questions</h2>
                    <p>Got questions? We've got answers.</p>
                </div>
                <div className="faq-grid">
                    {faqs.map((faq, i) => (
                        <div className="faq-item" key={i}>
                            <h3>{faq.q}</h3>
                            <p>{faq.a}</p>
                        </div>
                    ))}
                </div>
            </motion.section>
        </div>
    );
}
