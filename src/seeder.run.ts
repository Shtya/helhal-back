// seed-static-marketplace.ts
import * as dotenv from 'dotenv';
dotenv.config();
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User, UserStatus, SellerLevel, Job, Proposal, BudgetType, JobStatus, ProposalStatus, Category, CategoryType, Service, ServiceStatus, ServiceRequirement, Package, Setting } from 'entities/global.entity';

/* =========================
   HELPERS
========================== */
async function upsert<T extends { [k: string]: any }>(repo: { findOne: Function; save: Function; create: Function }, where: Partial<T>, data: Partial<T>): Promise<T> {
  const existing = await repo.findOne({ where });
  if (existing) return existing as T;
  const created = repo.create(data);
  return (await repo.save(created)) as T;
}

const USERS: Array<Partial<User>> = [
  {
    username: 'superadmin',
    email: 'admin@gmail.com',
    password: '123456',
    type: 'Business',
    role: 'admin',
    status: UserStatus.ACTIVE,
    phone: '+201000000001',
    profileImage: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    description: 'Platform administrator with full access.',
    languages: ['en'],
    country: 'US',
    skills: ['management', 'operations'],
    topRated: false,
    referralCode: 'ADMIN123',
    reputationPoints: 1000,
    balance: 0,
    ownerType: 'platform',
    totalEarned: 0,
    totalSpent: 0,
    education: [
      {
        degree: 'BSc in Computer Science',
        institution: 'Alexandria University',
        year: 2016,
      },
    ],

    certifications: [
      {
        name: 'AWS Certified Developer – Associate',
        issuingOrganization: 'Amazon Web Services',
        year: 2020,
      },
      {
        name: 'Full-Stack Web Development with React',
        issuingOrganization: 'Coursera',
        year: 2021,
      },
    ],
  },

  {
    username: 'creative_salma',
    email: 'seller@gmail.com',
    password: '123456',
    type: 'Individual',
    role: 'seller',
    status: UserStatus.ACTIVE,
    phone: '+201000000002',
    profileImage: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    description: 'UI/UX designer with 5+ years experience in Figma and Webflow.',
    languages: ['en', 'ar'],
    country: 'EG',
    skills: ['UI/UX', 'Figma', 'Webflow'],
    sellerLevel: SellerLevel.LVL2,
    topRated: true,
    referralCode: 'SALMA2025',
    ordersCompleted: 120,
    repeatBuyers: 35,
    reputationPoints: 2200,
    totalEarned: 15000,
  },

  {
    username: 'dev_ahmed',
    email: 'seller2@gmail.com',
    password: '123456',
    type: 'Individual',
    role: 'seller',
    status: UserStatus.ACTIVE,
    phone: '+201000000003',
    profileImage: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    description: 'Full-stack developer specializing in Next.js, NestJS, and TypeORM.',
    languages: ['en', 'ar'],
    country: 'EG',
    skills: ['Next.js', 'NestJS', 'PostgreSQL', 'TypeORM'],
    sellerLevel: SellerLevel.LVL1,
    topRated: false,
    referralCode: 'AHMEDDEV',
    ordersCompleted: 60,
    repeatBuyers: 15,
    reputationPoints: 950,
    totalEarned: 8000,
  },

  // --- Buyer 1 ---
  {
    username: 'mona_buyer',
    email: 'buyer@gmail.com',
    password: '123456',
    type: 'Individual',
    role: 'buyer',
    status: UserStatus.ACTIVE,
    phone: '+201000000004',
    profileImage: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    description: 'Buyer looking for reliable design & dev services.',
    languages: ['en', 'ar'],
    country: 'EG',
    skills: [],
    referralCode: 'MONA2025',
    totalSpent: 2000,
    education: [
      {
        degree: 'BSc in Computer Science',
        institution: 'Alexandria University',
        year: 2016,
      },
    ],

    certifications: [
      {
        name: 'AWS Certified Developer – Associate',
        issuingOrganization: 'Amazon Web Services',
        year: 2020,
      },
      {
        name: 'Full-Stack Web Development with React',
        issuingOrganization: 'Coursera',
        year: 2021,
      },
    ],
  },

  // --- Buyer 2 ---
  {
    username: 'globalcorp',
    email: 'buyer2@gmail.com',
    password: '123456',
    type: 'Business',
    role: 'buyer',
    status: UserStatus.ACTIVE,
    phone: '+201000000005',
    profileImage: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    description: 'Corporate buyer account for outsourcing projects.',
    languages: ['en'],
    country: 'US',
    skills: [],
    referralCode: 'CORP25',
    totalSpent: 45000,
    education: [
      {
        degree: 'BSc in Computer Science',
        institution: 'Alexandria University',
        year: 2016,
      },
    ],

    certifications: [
      {
        name: 'AWS Certified Developer – Associate',
        issuingOrganization: 'Amazon Web Services',
        year: 2020,
      },
      {
        name: 'Full-Stack Web Development with React',
        issuingOrganization: 'Coursera',
        year: 2021,
      },
    ],
  },
];

const CATEGORIES: Array<{ name: string; description?: string; image?: string; subs?: Array<{ name: string; description?: string; image?: string }> }> = [
  {
    name: 'Design',
    description: 'Branding, UI/UX, and all visual design services.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Logo Design', description: 'Logos, marks & brand icons.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'UI/UX', description: 'Web & mobile app UI/UX, wireframes, prototypes.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Social Media', description: 'Post designs & campaigns.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Presentation Design', description: 'Pitch decks & slide kits.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Development',
    description: 'Web, mobile, and backend development.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Frontend', description: 'React, Next.js, Vue, etc.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Backend', description: 'APIs, databases, integrations.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Full-stack', description: 'End-to-end app development.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Mobile Apps', description: 'iOS, Android, cross-platform.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'DevOps', description: 'CI/CD, Docker, cloud infra.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Writing & Translation',
    description: 'Content that informs, persuades, and ranks.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Copywriting', description: 'Landing pages, ads, emails.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Technical Writing', description: 'Docs, manuals, API guides.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Translation', description: 'Bilingual / multilingual content.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Editing & Proofreading', description: 'Clarity, tone, grammar.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Academic Writing', description: 'Essays, literature reviews.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Video & Animation',
    description: 'Editing, motion graphics, and explainers.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Video Editing', description: 'Cut, color, sound polish.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Motion Graphics', description: '2D/3D animation & titles.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Explainer Videos', description: 'Product & concept explainers.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Subtitles & Captions', description: 'Accessibility & reach.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Music & Audio',
    description: 'Voiceover, mixing, podcasts, and sound design.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Voice Over', description: 'Narration in multiple accents.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Podcast Editing', description: 'Cleanups, intros, mastering.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Mixing & Mastering', description: 'Radio-ready sound.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Sound Design', description: 'SFX for film & apps.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Digital Marketing',
    description: 'Acquisition, retention, and brand growth.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'SEO', description: 'On-page, technical, link building.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Social Media Marketing', description: 'Content + ads.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Performance Ads', description: 'Meta/Google/TikTok.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Email Marketing', description: 'Flows, campaigns, CRM.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Brand Strategy', description: 'Positioning & messaging.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Business',
    description: 'Plans, ops, and customer success.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Business Plans', description: 'Investor-ready docs.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Virtual Assistance', description: 'Research & admin.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Customer Support', description: 'Email/chat support.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Project Management', description: 'Delivery at scale.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Data',
    description: 'Dashboards, analysis, and ML pipelines.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Data Analysis', description: 'Insights & reports.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Dashboards', description: 'BI with charts & KPIs.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Data Engineering', description: 'ETL & warehousing.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Machine Learning', description: 'Models & MLOps.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'AI Services',
    description: 'Generative AI, RAG, agents, and automation.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Prompt Engineering', description: 'Prompts & evals.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Chatbots & Agents', description: 'Custom assistants.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'RAG Pipelines', description: 'Docs → search → answers.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Automation', description: 'APIs, webhooks, n8n.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Photography',
    description: 'Product, events, and lifestyle shoots.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Product Photography', description: 'Studio & e-commerce.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Event Photography', description: 'Weddings, conferences.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Portraits', description: 'Headshots & lifestyle.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Game Development',
    description: 'From prototypes to live-ops.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Unity', description: '2D/3D gameplay & tools.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Unreal', description: 'High-fidelity visuals.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Pixel Art', description: 'Sprites & tilesets.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Game Audio', description: 'SFX & music loops.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Education & Tutoring',
    description: 'Academic help and skill coaching.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'STEM Tutoring', description: 'Math, physics, CS.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Language Tutoring', description: 'English, Arabic, etc.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Test Prep', description: 'IELTS, TOEFL, SAT.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
  {
    name: 'Health & Fitness',
    description: 'Coaching, plans, and nutrition.',
    image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    subs: [
      { name: 'Workout Plans', description: 'Custom programs.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Nutrition', description: 'Diet & macros guidance.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
      { name: 'Physiotherapy', description: 'Recovery & mobility.', image: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    ],
  },
];

const SERVICES: Array<{ sellerUsername: string; title: string; brief: string; categoryName: string; subcategoryName: string; searchTags: string[]; status?: ServiceStatus; fastDelivery?: boolean; additionalRevision?: boolean; rating?: number; packages: Package[]; faq: Array<{ question: string; answer: string }>; gallery?: Array<{ url: string; fileName: string; type: string }> }> = [
  {
    sellerUsername: 'superadmin',
    title: 'I will design a premium, conversion-focused landing page UI',
    brief: 'Clean, modern landing page UI that elevates your brand and boosts conversions.',
    categoryName: 'Design',
    subcategoryName: 'UI/UX',
    searchTags: ['ui', 'ux', 'landing page', 'figma', 'wireframe'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: true,
    additionalRevision: true,
    rating: 4.8,
    packages: [
      { type: 'basic', price: 80, title: 'Starter', description: '1 section + hero, desktop only', revisions: 1, deliveryTime: 2, features: ['Desktop layout', 'Basic style guide'] },
      { type: 'standard', price: 160, title: 'Growth', description: 'Up to 4 sections, responsive', revisions: 2, deliveryTime: 4, features: ['Responsive', 'Interaction hints', 'Component library'] },
      { type: 'premium', price: 300, title: 'Scale', description: '8+ sections, full design system', revisions: 3, deliveryTime: 7, features: ['Design system', 'Prototype', 'Handoff package'] },
    ],
    faq: [
      { question: 'Do you provide source files?', answer: 'Yes, Figma is included.' },
      { question: 'Can you follow our brand?', answer: 'Absolutely—share your brand kit.' },
    ],
    gallery: [
      { url: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Landing page 1', type: 'image' },
      { url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Landing page 2', type: 'image' },
    ],
  },
  // 2
  {
    sellerUsername: 'superadmin',
    title: 'I will build a production-ready Next.js + NestJS app',
    brief: 'Robust, secure, and scalable web app with Next.js, NestJS, TypeORM, and PostgreSQL.',
    categoryName: 'Development',
    subcategoryName: 'Full-stack',
    searchTags: ['nextjs', 'nestjs', 'typeorm', 'postgres', 'fullstack'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.9,
    packages: [
      { type: 'basic', price: 250, title: 'MVP', description: 'Auth + 1 feature module', revisions: 1, deliveryTime: 7, features: ['Auth', 'CRUD module', 'Dockerfile'] },
      { type: 'standard', price: 600, title: 'Startup', description: 'Auth + 3 modules + CI', revisions: 2, deliveryTime: 14, features: ['Role-based auth', '3 feature modules', 'CI pipeline'] },
      { type: 'premium', price: 1200, title: 'Scale-up', description: 'Full app + tests + caching', revisions: 3, deliveryTime: 21, features: ['E2E tests', 'Redis cache', 'Observability'] },
    ],
    faq: [
      { question: 'Hosting included?', answer: 'Deployment guidance is included.' },
      { question: 'Tech handoff?', answer: 'Repo + docs + environment templates are provided.' },
    ],
    gallery: [
      { url: 'https://images.unsplash.com/photo-1581090700227-4c4a6b14c57c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Dashboard UI', type: 'image' },
      { url: 'https://images.unsplash.com/photo-1612197528418-679f1ddc43a4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Code preview', type: 'image' },
    ],
  },
  // 3
  {
    sellerUsername: 'creative_salma',
    title: 'I will create a social media strategy and 15 posts',
    brief: 'Boost engagement with tailored social media strategies and high-quality post designs.',
    categoryName: 'Writing & Translation',
    subcategoryName: 'Social Media',
    searchTags: ['social media', 'content', 'strategy', 'branding'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: true,
    additionalRevision: false,
    rating: 4.7,
    packages: [
      { type: 'basic', price: 50, title: 'Starter Pack', description: '5 posts + captions', revisions: 1, deliveryTime: 3, features: ['Captions', 'Hashtags'] },
      { type: 'standard', price: 120, title: 'Growth Pack', description: '10 posts + captions + scheduling plan', revisions: 2, deliveryTime: 5, features: ['Scheduling plan', 'Hashtag research'] },
      { type: 'premium', price: 200, title: 'Brand Boost', description: '15 posts + full strategy + report', revisions: 3, deliveryTime: 7, features: ['Analytics report', 'Campaign strategy'] },
    ],
    faq: [
      { question: 'Do you handle posting?', answer: 'I provide ready-to-post content, posting optional.' },
      { question: 'Can you follow brand guidelines?', answer: 'Yes, I can match your brand voice and style.' },
    ],
    gallery: [
      { url: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7f6a6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Social media mockup', type: 'image' },
      { url: 'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Campaign preview', type: 'image' },
    ],
  },
  // 4
  {
    sellerUsername: 'creative_salma',
    title: 'I will write SEO-friendly blog posts and articles',
    brief: 'Engaging, well-researched articles optimized for SEO and conversions.',
    categoryName: 'Video & Animation',
    subcategoryName: 'Content Writing',
    searchTags: ['seo', 'content', 'blog', 'article'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.6,
    packages: [
      { type: 'basic', price: 30, title: 'Quick Post', description: '500 words blog article', revisions: 1, deliveryTime: 2, features: ['SEO optimized', 'Grammarly checked'] },
      { type: 'standard', price: 70, title: 'In-depth Post', description: '1000 words article + 1 keyword set', revisions: 2, deliveryTime: 4, features: ['Keyword research', '2 subheadings'] },
      { type: 'premium', price: 120, title: 'Authority Post', description: '2000 words article + full SEO strategy', revisions: 3, deliveryTime: 7, features: ['Internal linking', 'Meta description', 'Competitor research'] },
    ],
    faq: [
      { question: 'Do you provide references?', answer: 'Yes, I use credible sources.' },
      { question: 'Can you write in a specific tone?', answer: 'Yes, I can adapt tone to your audience.' },
    ],
    gallery: [
      { url: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Article preview', type: 'image' },
      { url: 'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'SEO writing', type: 'image' },
    ],
  },

  // 5 Video editing
  {
    sellerUsername: 'creative_salma',
    title: 'I will edit your promotional video with motion graphics',
    brief: 'Professional video editing, color grading, and motion graphics for promo videos.',
    categoryName: 'Music & Audio',
    subcategoryName: 'Editing',
    searchTags: ['video', 'editing', 'promo', 'motion graphics'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: true,
    additionalRevision: true,
    rating: 4.9,
    packages: [
      { type: 'basic', price: 70, title: 'Trim & Color', description: 'Cut & basic color grade up to 2 min', revisions: 1, deliveryTime: 2, features: ['Cuts', 'Color grade'] },
      { type: 'standard', price: 180, title: 'Promo Edit', description: 'Up to 5 min + motion text', revisions: 2, deliveryTime: 4, features: ['Motion text', 'Music sync'] },
      { type: 'premium', price: 400, title: 'Full Motion Pack', description: 'Up to 10 min + advanced motion graphics', revisions: 3, deliveryTime: 7, features: ['Motion graphics', 'SFX', 'Delivery in 4K'] },
    ],
    faq: [
      { question: 'Do you add music?', answer: 'Royalty-free music included; licensed tracks extra.' },
      { question: 'What format?', answer: 'MP4/Mov or custom on request.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Promo edit', type: 'image' }],
  },

  // 6 Audio / Podcast
  {
    sellerUsername: 'creative_salma',
    title: 'I will edit and master your podcast episode',
    brief: 'Noise removal, leveling, EQ, and final master for professional-sounding podcasts.',
    categoryName: 'Digital Marketing',
    subcategoryName: 'Podcast Editing',
    searchTags: ['podcast', 'audio', 'editing', 'mastering'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: false,
    rating: 4.5,
    packages: [
      { type: 'basic', price: 25, title: 'Single Edit', description: 'Up to 30 min, noise removal', revisions: 1, deliveryTime: 2, features: ['Noise removal', 'Basic EQ'] },
      { type: 'standard', price: 60, title: 'Episode Clean', description: 'Up to 60 min, leveling & compression', revisions: 2, deliveryTime: 4, features: ['Compression', 'Leveling'] },
      { type: 'premium', price: 120, title: 'Full Master', description: 'Up to 90 min + intro/outro mix', revisions: 3, deliveryTime: 5, features: ['Intro/outro', 'Mastering'] },
    ],
    faq: [
      { question: 'Do you remove ums and pauses?', answer: 'Yes, manual edit removes unwanted noise and pauses.' },
      { question: 'Do you provide stem files?', answer: 'Stems available in premium.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Podcast mic', type: 'image' }],
  },

  // 7 Illustration
  {
    sellerUsername: 'dev_ahmed',
    title: 'I will create custom vector illustrations and icons',
    brief: 'Unique vector illustrations for brands, apps, and marketing.',
    categoryName: 'Business',
    subcategoryName: 'Illustration',
    searchTags: ['illustration', 'vector', 'icons', 'svg'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.7,
    packages: [
      { type: 'basic', price: 40, title: 'Single Icon', description: '1 custom icon (vector)', revisions: 1, deliveryTime: 2, features: ['SVG', 'PNG'] },
      { type: 'standard', price: 150, title: 'Set of Icons', description: '8 icons set, cohesive style', revisions: 2, deliveryTime: 5, features: ['SVG', 'Color variations'] },
      { type: 'premium', price: 400, title: 'Illustration Pack', description: '3 complex illustrations', revisions: 3, deliveryTime: 10, features: ['Full color', 'Source files'] },
    ],
    faq: [
      { question: 'File types?', answer: 'SVG, AI, EPS and PNG provided.' },
      { question: 'Can you match a style?', answer: 'Yes — provide examples.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1526318472351-c75fcf070d9b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Vector icons', type: 'image' }],
  },

  // 8 Mobile App
  {
    sellerUsername: 'dev_ahmed',
    title: 'I will build a React Native app with native modules',
    brief: 'Production-ready React Native app with native integrations and app store readiness.',
    categoryName: 'Data',
    subcategoryName: 'Mobile',
    searchTags: ['react native', 'mobile', 'ios', 'android'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.6,
    packages: [
      { type: 'basic', price: 400, title: 'Simple App', description: 'Auth + 2 screens', revisions: 1, deliveryTime: 7, features: ['Auth', 'Navigation'] },
      { type: 'standard', price: 900, title: 'App MVP', description: 'Auth + 6 screens + API', revisions: 2, deliveryTime: 14, features: ['API integration', 'Push notifications'] },
      { type: 'premium', price: 2000, title: 'Full App', description: 'Complete app + store submission', revisions: 3, deliveryTime: 28, features: ['Native modules', 'Store submission'] },
    ],
    faq: [
      { question: 'Will you publish?', answer: 'I can submit to stores if credentials are provided.' },
      { question: 'Which languages?', answer: 'JavaScript/TypeScript supported.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Mobile UI', type: 'image' }],
  },

  // 9 QA / Testing
  {
    sellerUsername: 'dev_ahmed',
    title: 'I will perform manual and automated QA for your app',
    brief: 'Test plans, manual QA, and automated test scripts (Cypress / Playwright).',
    categoryName: 'AI Services',
    subcategoryName: 'Testing',
    searchTags: ['qa', 'testing', 'cypress', 'playwright', 'automation'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: false,
    rating: 4.5,
    packages: [
      { type: 'basic', price: 80, title: 'Manual QA', description: 'Test plan + 1 round manual testing', revisions: 1, deliveryTime: 3, features: ['Bug report', 'Steps to reproduce'] },
      { type: 'standard', price: 200, title: 'Automated', description: '5 automated tests (E2E)', revisions: 2, deliveryTime: 7, features: ['Cypress tests', 'CI integration guidance'] },
      { type: 'premium', price: 450, title: 'Full QA', description: 'Manual + automated + regression', revisions: 3, deliveryTime: 10, features: ['Regression', 'Performance basics'] },
    ],
    faq: [
      { question: 'Do you write automated tests?', answer: 'Yes — Cypress or Playwright.' },
      { question: 'Do you run cross-browser?', answer: 'Yes, up to major browsers on desktop.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Testing dashboard', type: 'image' }],
  },

  // 10 DevOps
  {
    sellerUsername: 'dev_ahmed',
    title: 'I will set up CI/CD, Docker & Kubernetes for your app',
    brief: 'CI/CD pipelines, Dockerization, Kubernetes manifests and deployment guidance.',
    categoryName: 'Photography',
    subcategoryName: 'Infrastructure',
    searchTags: ['devops', 'kubernetes', 'docker', 'ci/cd'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.8,
    packages: [
      { type: 'basic', price: 150, title: 'Dockerize', description: 'Dockerfile + docker-compose', revisions: 1, deliveryTime: 3, features: ['Dockerfile', 'Compose'] },
      { type: 'standard', price: 350, title: 'CI/CD', description: 'GitHub Actions pipeline + tests', revisions: 2, deliveryTime: 7, features: ['Actions pipeline', 'Deployment script'] },
      { type: 'premium', price: 900, title: 'K8s Deploy', description: 'K8s manifests + Helm chart', revisions: 3, deliveryTime: 14, features: ['Helm chart', 'Ingress', 'Secrets management'] },
    ],
    faq: [
      { question: 'Do you manage cloud costs?', answer: 'I provide best-practices guidance.' },
      { question: 'Which cloud?', answer: 'Any—I work with AWS/GCP/Azure.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Kubernetes', type: 'image' }],
  },

  // 11 SEO Specialist
  {
    sellerUsername: 'dev_ahmed',
    title: 'I will do technical SEO audit and on-page optimization',
    brief: 'Comprehensive SEO audit, on-page fixes, and content recommendations.',
    categoryName: 'Design',
    subcategoryName: 'SEO',
    searchTags: ['seo', 'audit', 'on-page', 'technical seo'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.6,
    packages: [
      { type: 'basic', price: 60, title: 'Audit Basic', description: 'Site crawl + report', revisions: 1, deliveryTime: 3, features: ['Crawl report', 'Top issues'] },
      { type: 'standard', price: 180, title: 'Optimization', description: 'On-page fixes + meta', revisions: 2, deliveryTime: 7, features: ['Meta tags', 'Speed suggestions'] },
      { type: 'premium', price: 450, title: 'Full SEO', description: 'Audit + fixes + 5 content pieces', revisions: 3, deliveryTime: 14, features: ['Content plan', 'Link suggestions'] },
    ],
    faq: [
      { question: 'Do you guarantee rankings?', answer: 'No—SEO depends on many factors; I guarantee best practices.' },
      { question: 'Do you do keyword research?', answer: 'Yes, included in standard+.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'SEO audit', type: 'image' }],
  },

  // 12 E-commerce Store
  {
    sellerUsername: 'mona_buyer',
    title: 'I will set up a professional Shopify store',
    brief: 'Full Shopify setup, theme customization, and product import.',
    categoryName: 'Development',
    subcategoryName: 'Shopify',
    searchTags: ['shopify', 'ecommerce', 'store', 'theme'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.7,
    packages: [
      { type: 'basic', price: 150, title: 'Starter Shop', description: 'Theme setup + 10 products', revisions: 1, deliveryTime: 5, features: ['Theme install', '10 products'] },
      { type: 'standard', price: 450, title: 'Pro Shop', description: 'Custom theme tweaks + 50 products', revisions: 2, deliveryTime: 10, features: ['Custom tweaks', 'SEO basics'] },
      { type: 'premium', price: 900, title: 'Scale Shop', description: 'Full setup + apps + flows', revisions: 3, deliveryTime: 21, features: ['Apps setup', 'Flows & automations'] },
    ],
    faq: [
      { question: 'Do you provide images?', answer: 'I can add stock images; product photography extra.' },
      { question: 'Payment gateways?', answer: 'I set up your preferred gateways.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1495121605193-b116b5b09b06?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Shopify store', type: 'image' }],
  },

  // 13 Game dev prototype
  {
    sellerUsername: 'mona_buyer',
    title: 'I will build a Unity prototype or gameplay mechanic',
    brief: 'Playable Unity prototype for validation and pitching.',
    categoryName: 'Writing & Translation',
    subcategoryName: 'Prototype',
    searchTags: ['unity', 'game', 'prototype', 'gameplay'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.4,
    packages: [
      { type: 'basic', price: 150, title: 'Mechanic', description: 'Single mechanic prototype', revisions: 1, deliveryTime: 7, features: ['Playable demo', 'Source'] },
      { type: 'standard', price: 450, title: 'Level Demo', description: 'Small level + mechanics', revisions: 2, deliveryTime: 14, features: ['Level design', 'UI'] },
      { type: 'premium', price: 1200, title: 'Vertical Slice', description: 'Polished demo scene', revisions: 3, deliveryTime: 30, features: ['Polished assets', 'Optimization'] },
    ],
    faq: [
      { question: 'Which platform?', answer: 'PC/Web builds supported.' },
      { question: 'Do you create assets?', answer: 'I can use placeholders; art extra.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Unity prototype', type: 'image' }],
  },

  // 14 Localization / Translation
  {
    sellerUsername: 'mona_buyer',
    title: 'I will translate website content (EN ↔ AR) with localization',
    brief: 'Professional translation and localization for Arabic and English markets.',
    categoryName: 'Video & Animation',
    subcategoryName: 'Translation',
    searchTags: ['translation', 'arabic', 'localization', 'i18n'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: true,
    additionalRevision: false,
    rating: 4.9,
    packages: [
      { type: 'basic', price: 20, title: 'Short text', description: 'Up to 500 words', revisions: 1, deliveryTime: 1, features: ['Proofread'] },
      { type: 'standard', price: 60, title: 'Web Pages', description: 'Up to 1500 words', revisions: 2, deliveryTime: 3, features: ['Localization', 'SEO-aware'] },
      { type: 'premium', price: 150, title: 'Full site', description: 'Full localization + glossary', revisions: 3, deliveryTime: 7, features: ['Glossary', 'Context QA'] },
    ],
    faq: [
      { question: 'Do you support CMS?', answer: 'Yes — I can provide ready-to-paste translations.' },
      { question: 'Do you localize cultural references?', answer: 'Yes, I adapt content for local audiences.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Translation', type: 'image' }],
  },

  // 15 Product Photography
  {
    sellerUsername: 'mona_buyer',
    title: 'I will shoot professional product photos (studio)',
    brief: 'Studio product photography with white/creative backgrounds, retouching included.',
    categoryName: 'Music & Audio',
    subcategoryName: 'Product',
    searchTags: ['photography', 'product', 'retouch', 'studio'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.8,
    packages: [
      { type: 'basic', price: 100, title: '5 Shots', description: '5 product photos, basic retouch', revisions: 1, deliveryTime: 3, features: ['Background removal', 'High res'] },
      { type: 'standard', price: 250, title: '20 Shots', description: '20 photos + lifestyle mockup', revisions: 2, deliveryTime: 7, features: ['Lifestyle mockup', 'Color correction'] },
      { type: 'premium', price: 600, title: 'Full pack', description: '100 photos + retouch', revisions: 3, deliveryTime: 14, features: ['Advanced retouch', 'Multiple angles'] },
    ],
    faq: [
      { question: 'Do you ship products?', answer: 'Local pickup preferred; shipping negotiable.' },
      { question: 'Do you provide models?', answer: 'Model hire is extra.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1503602642458-232111445657?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Product photo', type: 'image' }],
  },

  // 16 Legal Contracts
  {
    sellerUsername: 'mona_buyer',
    title: 'I will draft and review business contracts and NDAs',
    brief: 'Legal drafting and review for startups and small businesses (templates + custom).',
    categoryName: 'Digital Marketing',
    subcategoryName: 'Legal',
    searchTags: ['legal', 'contract', 'nda', 'review'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.6,
    packages: [
      { type: 'basic', price: 50, title: 'Template Review', description: 'Review & redline simple contract', revisions: 1, deliveryTime: 2, features: ['Redline', 'Comments'] },
      { type: 'standard', price: 180, title: 'Custom Contract', description: 'Drafted custom contract (1 round)', revisions: 2, deliveryTime: 5, features: ['Draft', '2 parties'] },
      { type: 'premium', price: 400, title: 'Package', description: 'Templates + review + consultation', revisions: 3, deliveryTime: 7, features: ['Phone consult', 'Multiple templates'] },
    ],
    faq: [
      { question: 'Is this legal advice?', answer: 'This is document drafting; consult a local lawyer for jurisdictional advice.' },
      { question: 'Which jurisdictions?', answer: 'I draft for common law jurisdictions; ask for specifics.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1559526324-593bc073d938?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Legal drafting', type: 'image' }],
  },

  // 17 Data & Analytics
  {
    sellerUsername: 'globalcorp',
    title: 'I will build dashboards and analytics with Metabase/Looker Studio',
    brief: 'Data modeling, ETL suggestions, and interactive dashboards for business KPIs.',
    categoryName: 'Business',
    subcategoryName: 'Analytics',
    searchTags: ['analytics', 'dashboard', 'data', 'metabase'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.7,
    packages: [
      { type: 'basic', price: 120, title: 'Simple Dashboard', description: '1 dashboard + 5 charts', revisions: 1, deliveryTime: 5, features: ['Data connectors', 'Filters'] },
      { type: 'standard', price: 350, title: 'Business Dash', description: 'Multiple dashboards + ETL guidance', revisions: 2, deliveryTime: 10, features: ['ETL suggestions', 'Scheduled reports'] },
      { type: 'premium', price: 900, title: 'Data Platform', description: 'Modeling + dashboards + automation', revisions: 3, deliveryTime: 21, features: ['Data model', 'Alerts'] },
    ],
    faq: [
      { question: 'Do you connect databases?', answer: 'Yes — I connect to Postgres, MySQL, BigQuery, etc.' },
      { question: 'Do you write SQL?', answer: 'Yes, advanced SQL reporting included.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1518779578993-ec3579fee39f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Analytics dashboard', type: 'image' }],
  },

  // 18 Animation / Motion
  {
    sellerUsername: 'globalcorp',
    title: 'I will create a 30s 2D explainer animation',
    brief: 'Script-to-screen 2D explainer with voiceover and music.',
    categoryName: 'Data',
    subcategoryName: 'Animation',
    searchTags: ['animation', '2d', 'explainer', 'motion graphics'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.9,
    packages: [
      { type: 'basic', price: 200, title: '30s Basic', description: '30s animation + background music', revisions: 1, deliveryTime: 7, features: ['Storyboard', 'Music'] },
      { type: 'standard', price: 450, title: '60s Standard', description: '60s + voiceover + revisions', revisions: 2, deliveryTime: 14, features: ['Voiceover', 'SFX'] },
      { type: 'premium', price: 1000, title: 'Explainer Pack', description: '90s full package + localization', revisions: 3, deliveryTime: 21, features: ['Localization', 'Multiple formats'] },
    ],
    faq: [
      { question: 'Do you provide script help?', answer: 'Yes, I provide basic script and storyboard guidance.' },
      { question: 'Voiceover included?', answer: 'Standard includes royalty-free voice; custom voice extra.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1519181245277-cffeb31da2a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: '2D animation', type: 'image' }],
  },

  // 19 Branding / Identity
  {
    sellerUsername: 'globalcorp',
    title: 'I will create a full brand identity and guidelines',
    brief: 'Logo, color system, typography, and a compact brand guide for teams.',
    categoryName: 'AI Services',
    subcategoryName: 'Branding',
    searchTags: ['branding', 'logo', 'identity', 'brand guide'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.8,
    packages: [
      { type: 'basic', price: 120, title: 'Logo Only', description: 'Primary logo + color palette', revisions: 1, deliveryTime: 3, features: ['Logo PNG/SVG', 'Colors'] },
      { type: 'standard', price: 350, title: 'Starter Brand', description: 'Logo + stationery + guidelines', revisions: 2, deliveryTime: 7, features: ['Business card', 'Guidelines PDF'] },
      { type: 'premium', price: 800, title: 'Full Identity', description: 'Full visual system + assets', revisions: 3, deliveryTime: 14, features: ['Design system', 'Assets pack'] },
    ],
    faq: [
      { question: 'Do you do revisions?', answer: 'Yes — the package includes listed revision rounds.' },
      { question: 'Are fonts included?', answer: 'I recommend fonts; license purchase may be needed.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'Brand identity', type: 'image' }],
  },

  // 20 AR/VR Prototype
  {
    sellerUsername: 'globalcorp',
    title: 'I will build an AR prototype for product visualization',
    brief: 'AR prototype for web or mobile to visualize products in real space.',
    categoryName: 'Photography',
    subcategoryName: 'AR',
    searchTags: ['ar', 'augmented reality', 'prototype', 'product visualization'],
    status: ServiceStatus.ACTIVE,
    fastDelivery: false,
    additionalRevision: true,
    rating: 4.5,
    packages: [
      { type: 'basic', price: 200, title: 'AR Viewer', description: 'Single product AR viewer', revisions: 1, deliveryTime: 7, features: ['Web AR', 'Basic interaction'] },
      { type: 'standard', price: 600, title: 'AR Suite', description: 'Multiple products + interactions', revisions: 2, deliveryTime: 14, features: ['Scaling/rotation', 'Lighting'] },
      { type: 'premium', price: 1500, title: 'Custom AR', description: 'Custom interactions + analytics', revisions: 3, deliveryTime: 28, features: ['Analytics', 'Custom UI'] },
    ],
    faq: [
      { question: 'Do you provide 3D models?', answer: 'I can convert models; 3D modeling is extra.' },
      { question: 'Which AR tech?', answer: 'I use WebAR frameworks and can adapt to native SDKs.' },
    ],
    gallery: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', fileName: 'AR prototype', type: 'image' }],
  },
];

const JOB_SEED: { buyerUsername: string; title: string; description: string; categoryName: string; subcategoryName: string; budget: number; budgetType: BudgetType; preferredDeliveryDays: number; skillsRequired: string[]; attachments: { name: string; url: string; type: string; uploadedAt: Date }[]; additionalInfo?: string } = {
  buyerUsername: 'moh_buyer',
  title: 'Landing page redesign for health NGO program',
  description: 'We need a clean landing page to explain our health program and drive volunteer sign-ups.',
  categoryName: 'Design',
  subcategoryName: 'UI/UX',
  budget: 350,
  budgetType: BudgetType.FIXED,
  preferredDeliveryDays: 5,
  skillsRequired: ['UI/UX', 'Figma', 'Accessibility'],
  attachments: [
    {
      name: 'brand_guide.pdf',
      url: '/uploads/attachments/brand_guide.pdf',
      type: 'application/pdf',
      uploadedAt: new Date(),
    },
  ],
  additionalInfo: 'Arabic/English bilingual is a plus.',
};

const PROPOSAL_SEED: Array<{ jobTitle: string; sellerUsername: string; coverLetter: string; bidAmount: number; bidType: BudgetType; estimatedTimeDays: number; attachments?: { name: string; url: string; type: string; uploadedAt: Date }[]; status?: ProposalStatus }> = [
  {
    jobTitle: JOB_SEED.title,
    sellerUsername: 'superadmin',
    coverLetter: 'I specialize in conversion-focused health/NGO pages. I can deliver a bilingual UI with accessible components.',
    bidAmount: 340,
    bidType: BudgetType.FIXED,
    estimatedTimeDays: 5,
    attachments: [],
    status: ProposalStatus.SUBMITTED,
  },
  {
    jobTitle: JOB_SEED.title,
    sellerUsername: 'superadmin',
    coverLetter: 'I can deliver UI + a simple Next.js implementation to preview interactions. Pixel-perfect and fast.',
    bidAmount: 380,
    bidType: BudgetType.FIXED,
    estimatedTimeDays: 6,
    attachments: [],
    status: ProposalStatus.SUBMITTED,
  },
];

async function seedSettings(dataSource: DataSource) {
  const settingRepo = dataSource.getRepository(Setting);
  const userRepo = dataSource.getRepository(User);
  const serviceRepo = dataSource.getRepository(Service);
  const categoryRepo = dataSource.getRepository(Category);

  // Optional relations to enrich arrays
  const [topRatedServices, fastDeliveryServices, businessServices, featuredCats] = await Promise.all([
    serviceRepo.find({ order: { rating: 'DESC' as const }, take: 6 }),
    serviceRepo.find({ where: { fastDelivery: true }, take: 6 }),
    // "business recommendations": prefer services from business-type sellers, if your Service has sellerId -> User
    serviceRepo
      .createQueryBuilder('svc')
      .leftJoin(User, 'u', 'u.id = svc.sellerId')
      .where('u.type = :t', { t: 'Business' })
      .take(6)
      .getMany()
      .catch(() => [] as Service[]),
    categoryRepo.find({
      where: { type: CategoryType.CATEGORY },
      take: 6,
    }),
  ]);

  const platformUser = (await userRepo.findOne({ where: { role: 'admin' } })) ?? (await userRepo.findOne({ where: { email: 'admin@gmail.com' } }));

  const popularServices = (topRatedServices || []).map(s => Number(s.id)).filter(Boolean);
  const recommendedServices = (fastDeliveryServices || []).map(s => Number(s.id)).filter(Boolean);
  const businessRecommendations = (businessServices || []).map(s => Number(s.id)).filter(Boolean);
  const featuredCategories = (featuredCats || []).map(c => Number(c.id)).filter(Boolean);

  // If your DB uses UUIDs, but columns here are int[], ensure the column type matches your IDs.
  // Otherwise, keep as number[] as defined in your entity.

  await upsert<Setting>(
    settingRepo,
    { siteName: 'SkillForge' }, // unique-enough natural key to avoid duplicate settings
    {
      siteName: 'SkillForge',
      platformAccountUserId: platformUser ? String(platformUser.id) : null,
      siteLogo: 'https://images.unsplash.com/photo-1508830524289-0adcbe822b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=320&q=60',
      privacyPolicy: `
				We value your privacy. We collect only the data needed to operate the marketplace,
				improve services, and comply with law. You can request data export or deletion at any time by
				contacting support. See the full policy in your account settings.
      `.trim(),
      termsOfService: `
				By using SkillForge, you agree to the platform rules: no illegal content, respect IP rights,
				and follow fair-use and payment policies. The platform may hold funds in escrow and charge
				a platform fee on transactions. Disputes are handled per our dispute policy.
      `.trim(),
      contactEmail: 'support@skillforge.example',
      supportPhone: '+201234567890',

      // Decimal percentage for platform commissions
      platformPercent: 10.0,

      // ISO 4217 numeric (example: 818=EGP, 840=USD). Your column is number, so we store the numeric code.
      defaultCurrency: 818, // EGP

      jobsRequireApproval: true,

      // Arrays (int[]) — filled if we found related rows; otherwise remain empty.
      popularServices,
      clientsExperiences: [], // fill with existing experience IDs if/when you have them
      featuredCategories,
      recommendedServices,
      businessRecommendations,
      faqs: [], // fill with FAQ IDs if you maintain a FAQ table
      buyerStories: [], // fill with story IDs if you maintain buyer stories
    },
  );

  console.log('✅ Setting seeded/ensured.');
}

async function seedUsers(dataSource: DataSource) {
  const repo = dataSource.getRepository(User);
  const saved: Record<string, User> = {};
  for (const u of USERS) {
    const user = await upsert<User>(repo, { email: u.email }, u);
    saved[user.username] = user;
  }
  return saved; // map by username
}

async function seedCategories(dataSource: DataSource) {
  const repo = dataSource.getRepository(Category);

  const byName: Record<string, Category> = {};

  for (const cat of CATEGORIES) {
    const parent = await upsert<Category>(
      repo,
      { name: cat.name },
      {
        type: CategoryType.CATEGORY,
        name: cat.name,
        description: cat.description ?? null,
        image: cat.image ?? null,
      },
    );
    byName[parent.name] = parent;

    if (cat.subs?.length) {
      for (const sub of cat.subs) {
        const subcat = await upsert<Category>(
          repo,
          { name: sub.name },
          {
            type: CategoryType.SUBCATEGORY,
            name: sub.name,
            description: sub.description ?? null,
            image: sub.image ?? null,
            parentId: parent.id, // parentId is a plain string column in your entity
          },
        );
        byName[subcat.name] = subcat;
      }
    }
  }

  return byName; // map by category name
}

async function seedServices(dataSource: DataSource, usersByUsername: Record<string, User>, catsByName: Record<string, Category>) {
  const repo = dataSource.getRepository(Service);
  const saved: Record<string, Service> = {};

  for (const s of SERVICES) {
    const seller = usersByUsername[s.sellerUsername];
    const parent = catsByName[s.categoryName];
    const reqRepo = dataSource.getRepository(ServiceRequirement);

    const saved: Record<string, Service> = {};
    const requirementsSeed: Array<Pick<ServiceRequirement, 'requirementType' | 'question' | 'isRequired' | 'options'>> = [
      { requirementType: 'text', question: 'Please provide a short description of your project', isRequired: true, options: [] },
      { requirementType: 'multiple_choice', question: 'Which platform do you prefer?', isRequired: true, options: ['WordPress', 'Shopify', 'Custom Code', 'Other'] },
      { requirementType: 'file', question: 'Upload your brand guidelines or logo', isRequired: false, options: [] },
      { requirementType: 'multiple_choice', question: 'What is your campaign goal?', isRequired: true, options: ['Brand Awareness', 'Lead Generation', 'Sales', 'Engagement'] },
    ];

    const service = await upsert<any>(
      repo,
      { title: s.title },
      {
        sellerId: seller?.id,
        title: s.title,
        brief: s.brief,
        metadata: {},
        searchTags: s.searchTags,
        categoryId: parent.id,
        // subcategoryId: sub.id,
        status: s.status ?? ServiceStatus.DRAFT,
        impressions: 0,
        clicks: 0,
        ordersCount: 0,
        cancellations: 0,
        performanceScore: 0,
        fastDelivery: !!s.fastDelivery,
        additionalRevision: !!s.additionalRevision,
        rating: s.rating ?? 0,
        faq: s.faq,
        packages: s.packages,
        gallery: s.gallery ?? [],
      },
    );
    await reqRepo.delete({ serviceId: service.id });

    const reqEntities = requirementsSeed.map(r =>
      reqRepo.create({
        ...r,
        serviceId: service.id, // or: service: service
      }),
    );

    await reqRepo.save(reqEntities);

    // Optionally reflect on the object you return
    service.requirements = reqEntities;

    saved[s.title] = service;
  }

  return saved; // map by service title
}

async function seedJobAndProposals(dataSource: DataSource, usersByUsername: Record<string, User>, catsByName: Record<string, Category>) {
  const jobRepo = dataSource.getRepository(Job);
  const propRepo = dataSource.getRepository(Proposal);

  // Job
  const buyer = usersByUsername[JOB_SEED.buyerUsername];
  const parent = catsByName[JOB_SEED.categoryName];
  const sub = catsByName[JOB_SEED.subcategoryName];
  if (!buyer || !parent || !sub) {
    console.warn('⛔ Skipping Job due to missing relations.');
    return;
  }

  const job = await upsert<Job>(
    jobRepo,
    { title: JOB_SEED.title },
    {
      buyerId: buyer.id,
      title: JOB_SEED.title,
      description: JOB_SEED.description,
      categoryId: parent.id,
      subcategoryId: sub.id,
      budget: JOB_SEED.budget,
      budgetType: JOB_SEED.budgetType,
      status: JobStatus.PUBLISHED,
      preferredDeliveryDays: JOB_SEED.preferredDeliveryDays,
      skillsRequired: JOB_SEED.skillsRequired,
      attachments: JOB_SEED.attachments,
      additionalInfo: JOB_SEED.additionalInfo ?? null,
      closedAt: null,
    },
  );

  // Proposals
  for (const p of PROPOSAL_SEED) {
    const seller = usersByUsername[p.sellerUsername];
    if (!seller) {
      console.warn(`⛔ Skipping proposal by "${p.sellerUsername}" (seller not found).`);
      continue;
    }

    await upsert<Proposal>(
      propRepo,
      { jobId: job.id, sellerId: seller.id },
      {
        jobId: job.id,
        sellerId: seller.id,
        coverLetter: p.coverLetter,
        bidAmount: p.bidAmount,
        bidType: p.bidType,
        estimatedTimeDays: p.estimatedTimeDays,
        portfolio: null,
        status: p.status ?? ProposalStatus.SUBMITTED,
        attachments: p.attachments ?? [],
      },
    );
  }
}

export const runSeeder = async () => {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: true,
  });

  try {
    await dataSource.initialize();
    // const tables = await dataSource.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'; `);
    // const tableNames = tables.map((t: { tablename: string }) => `"${t.tablename}"`).join(', ');
    // if (tableNames.length) {
    //   await dataSource.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE;`);
    //   console.log('🧹 Database truncated.');
    // }

    // const usersByUsername = await seedUsers(dataSource);
    // const catsByName = await seedCategories(dataSource);
    // await seedServices(dataSource, usersByUsername, catsByName);
    // await seedJobAndProposals(dataSource, usersByUsername, catsByName);
    await seedSettings(dataSource);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await (await Promise.resolve(dataSource)).destroy();
  }
};

// Run directly
if (require.main === module) {
  runSeeder();
}
