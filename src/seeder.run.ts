// seed-static-marketplace.ts
import * as dotenv from 'dotenv';
dotenv.config();
import 'reflect-metadata';
import { DataSource, DeepPartial } from 'typeorm';
import { User, UserStatus, SellerLevel, Job, Proposal, BudgetType, JobStatus, ProposalStatus, Category, CategoryType, Service, ServiceStatus, ServiceRequirement, Package, Setting, Country } from 'entities/global.entity';

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
    countryId: null,
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
    countryId: null,
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
    countryId: null,
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
    countryId: null,
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
    countryId: null,
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
      privacyPolicy_en: `
				We value your privacy. We collect only the data needed to operate the marketplace,
				improve services, and comply with law. You can request data export or deletion at any time by
				contacting support. See the full policy in your account settings.
      `.trim(),
      termsOfService_en: `
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
      { name_en: cat.name },
      {
        type: CategoryType.CATEGORY,
        name_en: cat.name,
        name_ar: cat.name,
        description: cat.description ?? null,
        image: cat.image ?? null,
      },
    );
    byName[parent.name_en] = parent;

    if (cat.subs?.length) {
      for (const sub of cat.subs) {
        const subcat = await upsert<Category>(
          repo,
          { name_en: sub.name },
          {
            type: CategoryType.SUBCATEGORY,
            name_en: cat.name,
            name_ar: cat.name,
            description: sub.description ?? null,
            image: sub.image ?? null,
            parentId: parent.id, // parentId is a plain string column in your entity
          },
        );
        byName[subcat.name_en] = subcat;
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

// const seedCountries = async (dataSource: DataSource) => {
//   const repo = dataSource.getRepository(Country);

//   const countries: DeepPartial<Country>[] =
//     [{
//       "name": "Afghanistan",
//       "isoAlpha2": "AF",
//       "isoAlpha3": "AFG",
//       "isoNumeric": 4,
//       "currencyCode": "AFN",
//       "currencyName": "Afghani",
//       "currencySymbol": "؋"
//     }, {
//       "name": "Albania",
//       "isoAlpha2": "AL",
//       "isoAlpha3": "ALB",
//       "isoNumeric": 8,
//       "currencyCode": "ALL",
//       "currencyName": "Lek",
//       "currencySymbol": "Lek"
//     }, {
//       "name": "Algeria",
//       "isoAlpha2": "DZ",
//       "isoAlpha3": "DZA",
//       "isoNumeric": 12,
//       "currencyCode": "DZD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "American Samoa",
//       "isoAlpha2": "AS",
//       "isoAlpha3": "ASM",
//       "isoNumeric": 16,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Andorra",
//       "isoAlpha2": "AD",
//       "isoAlpha3": "AND",
//       "isoNumeric": 20,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Angola",
//       "isoAlpha2": "AO",
//       "isoAlpha3": "AGO",
//       "isoNumeric": 24,
//       "currencyCode": "AOA",
//       "currencyName": "Kwanza",
//       "currencySymbol": "Kz"
//     }, {
//       "name": "Anguilla",
//       "isoAlpha2": "AI",
//       "isoAlpha3": "AIA",
//       "isoNumeric": 660,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Antarctica",
//       "isoAlpha2": "AQ",
//       "isoAlpha3": "ATA",
//       "isoNumeric": 10,
//       "currencyCode": "",
//       "currencyName": "",
//       "currencySymbol": null
//     }, {
//       "name": "Antigua and Barbuda",
//       "isoAlpha2": "AG",
//       "isoAlpha3": "ATG",
//       "isoNumeric": 28,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Argentina",
//       "isoAlpha2": "AR",
//       "isoAlpha3": "ARG",
//       "isoNumeric": 32,
//       "currencyCode": "ARS",
//       "currencyName": "Peso",
//       "currencySymbol": "$"
//     }, {
//       "name": "Armenia",
//       "isoAlpha2": "AM",
//       "isoAlpha3": "ARM",
//       "isoNumeric": 51,
//       "currencyCode": "AMD",
//       "currencyName": "Dram",
//       "currencySymbol": null
//     }, {
//       "name": "Aruba",
//       "isoAlpha2": "AW",
//       "isoAlpha3": "ABW",
//       "isoNumeric": 533,
//       "currencyCode": "AWG",
//       "currencyName": "Guilder",
//       "currencySymbol": "ƒ"
//     }, {
//       "name": "Australia",
//       "isoAlpha2": "AU",
//       "isoAlpha3": "AUS",
//       "isoNumeric": 36,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Austria",
//       "isoAlpha2": "AT",
//       "isoAlpha3": "AUT",
//       "isoNumeric": 40,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Azerbaijan",
//       "isoAlpha2": "AZ",
//       "isoAlpha3": "AZE",
//       "isoNumeric": 31,
//       "currencyCode": "AZN",
//       "currencyName": "Manat",
//       "currencySymbol": "ман"
//     }, {
//       "name": "Bahamas",
//       "isoAlpha2": "BS",
//       "isoAlpha3": "BHS",
//       "isoNumeric": 44,
//       "currencyCode": "BSD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Bahrain",
//       "isoAlpha2": "BH",
//       "isoAlpha3": "BHR",
//       "isoNumeric": 48,
//       "currencyCode": "BHD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Bangladesh",
//       "isoAlpha2": "BD",
//       "isoAlpha3": "BGD",
//       "isoNumeric": 50,
//       "currencyCode": "BDT",
//       "currencyName": "Taka",
//       "currencySymbol": null
//     }, {
//       "name": "Barbados",
//       "isoAlpha2": "BB",
//       "isoAlpha3": "BRB",
//       "isoNumeric": 52,
//       "currencyCode": "BBD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Belarus",
//       "isoAlpha2": "BY",
//       "isoAlpha3": "BLR",
//       "isoNumeric": 112,
//       "currencyCode": "BYR",
//       "currencyName": "Ruble",
//       "currencySymbol": "p."
//     }, {
//       "name": "Belgium",
//       "isoAlpha2": "BE",
//       "isoAlpha3": "BEL",
//       "isoNumeric": 56,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Belize",
//       "isoAlpha2": "BZ",
//       "isoAlpha3": "BLZ",
//       "isoNumeric": 84,
//       "currencyCode": "BZD",
//       "currencyName": "Dollar",
//       "currencySymbol": "BZ$"
//     }, {
//       "name": "Benin",
//       "isoAlpha2": "BJ",
//       "isoAlpha3": "BEN",
//       "isoNumeric": 204,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Bermuda",
//       "isoAlpha2": "BM",
//       "isoAlpha3": "BMU",
//       "isoNumeric": 60,
//       "currencyCode": "BMD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Bhutan",
//       "isoAlpha2": "BT",
//       "isoAlpha3": "BTN",
//       "isoNumeric": 64,
//       "currencyCode": "BTN",
//       "currencyName": "Ngultrum",
//       "currencySymbol": null
//     }, {
//       "name": "Bolivia",
//       "isoAlpha2": "BO",
//       "isoAlpha3": "BOL",
//       "isoNumeric": 68,
//       "currencyCode": "BOB",
//       "currencyName": "Boliviano",
//       "currencySymbol": "$b"
//     }, {
//       "name": "Bosnia and Herzegovina",
//       "isoAlpha2": "BA",
//       "isoAlpha3": "BIH",
//       "isoNumeric": 70,
//       "currencyCode": "BAM",
//       "currencyName": "Marka",
//       "currencySymbol": "KM"
//     }, {
//       "name": "Botswana",
//       "isoAlpha2": "BW",
//       "isoAlpha3": "BWA",
//       "isoNumeric": 72,
//       "currencyCode": "BWP",
//       "currencyName": "Pula",
//       "currencySymbol": "P"
//     }, {
//       "name": "Bouvet Island",
//       "isoAlpha2": "BV",
//       "isoAlpha3": "BVT",
//       "isoNumeric": 74,
//       "currencyCode": "NOK",
//       "currencyName": "Krone",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Brazil",
//       "isoAlpha2": "BR",
//       "isoAlpha3": "BRA",
//       "isoNumeric": 76,
//       "currencyCode": "BRL",
//       "currencyName": "Real",
//       "currencySymbol": "R$"
//     }, {
//       "name": "British Indian Ocean Territory",
//       "isoAlpha2": "IO",
//       "isoAlpha3": "IOT",
//       "isoNumeric": 86,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "British Virgin Islands",
//       "isoAlpha2": "VG",
//       "isoAlpha3": "VGB",
//       "isoNumeric": 92,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Brunei",
//       "isoAlpha2": "BN",
//       "isoAlpha3": "BRN",
//       "isoNumeric": 96,
//       "currencyCode": "BND",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Bulgaria",
//       "isoAlpha2": "BG",
//       "isoAlpha3": "BGR",
//       "isoNumeric": 100,
//       "currencyCode": "BGN",
//       "currencyName": "Lev",
//       "currencySymbol": "лв"
//     }, {
//       "name": "Burkina Faso",
//       "isoAlpha2": "BF",
//       "isoAlpha3": "BFA",
//       "isoNumeric": 854,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Burundi",
//       "isoAlpha2": "BI",
//       "isoAlpha3": "BDI",
//       "isoNumeric": 108,
//       "currencyCode": "BIF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Cambodia",
//       "isoAlpha2": "KH",
//       "isoAlpha3": "KHM",
//       "isoNumeric": 116,
//       "currencyCode": "KHR",
//       "currencyName": "Riels",
//       "currencySymbol": "៛"
//     }, {
//       "name": "Cameroon",
//       "isoAlpha2": "CM",
//       "isoAlpha3": "CMR",
//       "isoNumeric": 120,
//       "currencyCode": "XAF",
//       "currencyName": "Franc",
//       "currencySymbol": "FCF"
//     }, {
//       "name": "Canada",
//       "isoAlpha2": "CA",
//       "isoAlpha3": "CAN",
//       "isoNumeric": 124,
//       "currencyCode": "CAD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Cape Verde",
//       "isoAlpha2": "CV",
//       "isoAlpha3": "CPV",
//       "isoNumeric": 132,
//       "currencyCode": "CVE",
//       "currencyName": "Escudo",
//       "currencySymbol": null
//     }, {
//       "name": "Cayman Islands",
//       "isoAlpha2": "KY",
//       "isoAlpha3": "CYM",
//       "isoNumeric": 136,
//       "currencyCode": "KYD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Central African Republic",
//       "isoAlpha2": "CF",
//       "isoAlpha3": "CAF",
//       "isoNumeric": 140,
//       "currencyCode": "XAF",
//       "currencyName": "Franc",
//       "currencySymbol": "FCF"
//     }, {
//       "name": "Chad",
//       "isoAlpha2": "TD",
//       "isoAlpha3": "TCD",
//       "isoNumeric": 148,
//       "currencyCode": "XAF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Chile",
//       "isoAlpha2": "CL",
//       "isoAlpha3": "CHL",
//       "isoNumeric": 152,
//       "currencyCode": "CLP",
//       "currencyName": "Peso",
//       "currencySymbol": null
//     }, {
//       "name": "China",
//       "isoAlpha2": "CN",
//       "isoAlpha3": "CHN",
//       "isoNumeric": 156,
//       "currencyCode": "CNY",
//       "currencyName": "YuanRenminbi",
//       "currencySymbol": "¥"
//     }, {
//       "name": "Christmas Island",
//       "isoAlpha2": "CX",
//       "isoAlpha3": "CXR",
//       "isoNumeric": 162,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Cocos Islands",
//       "isoAlpha2": "CC",
//       "isoAlpha3": "CCK",
//       "isoNumeric": 166,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Colombia",
//       "isoAlpha2": "CO",
//       "isoAlpha3": "COL",
//       "isoNumeric": 170,
//       "currencyCode": "COP",
//       "currencyName": "Peso",
//       "currencySymbol": "$"
//     }, {
//       "name": "Comoros",
//       "isoAlpha2": "KM",
//       "isoAlpha3": "COM",
//       "isoNumeric": 174,
//       "currencyCode": "KMF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Cook Islands",
//       "isoAlpha2": "CK",
//       "isoAlpha3": "COK",
//       "isoNumeric": 184,
//       "currencyCode": "NZD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Costa Rica",
//       "isoAlpha2": "CR",
//       "isoAlpha3": "CRI",
//       "isoNumeric": 188,
//       "currencyCode": "CRC",
//       "currencyName": "Colon",
//       "currencySymbol": "₡"
//     }, {
//       "name": "Croatia",
//       "isoAlpha2": "HR",
//       "isoAlpha3": "HRV",
//       "isoNumeric": 191,
//       "currencyCode": "HRK",
//       "currencyName": "Kuna",
//       "currencySymbol": "kn"
//     }, {
//       "name": "Cuba",
//       "isoAlpha2": "CU",
//       "isoAlpha3": "CUB",
//       "isoNumeric": 192,
//       "currencyCode": "CUP",
//       "currencyName": "Peso",
//       "currencySymbol": "₱"
//     }, {
//       "name": "Cyprus",
//       "isoAlpha2": "CY",
//       "isoAlpha3": "CYP",
//       "isoNumeric": 196,
//       "currencyCode": "CYP",
//       "currencyName": "Pound",
//       "currencySymbol": null
//     }, {
//       "name": "Czech Republic",
//       "isoAlpha2": "CZ",
//       "isoAlpha3": "CZE",
//       "isoNumeric": 203,
//       "currencyCode": "CZK",
//       "currencyName": "Koruna",
//       "currencySymbol": "Kč"
//     }, {
//       "name": "Democratic Republic of the Congo",
//       "isoAlpha2": "CD",
//       "isoAlpha3": "COD",
//       "isoNumeric": 180,
//       "currencyCode": "CDF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Denmark",
//       "isoAlpha2": "DK",
//       "isoAlpha3": "DNK",
//       "isoNumeric": 208,
//       "currencyCode": "DKK",
//       "currencyName": "Krone",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Djibouti",
//       "isoAlpha2": "DJ",
//       "isoAlpha3": "DJI",
//       "isoNumeric": 262,
//       "currencyCode": "DJF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Dominica",
//       "isoAlpha2": "DM",
//       "isoAlpha3": "DMA",
//       "isoNumeric": 212,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Dominican Republic",
//       "isoAlpha2": "DO",
//       "isoAlpha3": "DOM",
//       "isoNumeric": 214,
//       "currencyCode": "DOP",
//       "currencyName": "Peso",
//       "currencySymbol": "RD$"
//     }, {
//       "name": "East Timor",
//       "isoAlpha2": "TL",
//       "isoAlpha3": "TLS",
//       "isoNumeric": 626,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Ecuador",
//       "isoAlpha2": "EC",
//       "isoAlpha3": "ECU",
//       "isoNumeric": 218,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Egypt",
//       "isoAlpha2": "EG",
//       "isoAlpha3": "EGY",
//       "isoNumeric": 818,
//       "currencyCode": "EGP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "El Salvador",
//       "isoAlpha2": "SV",
//       "isoAlpha3": "SLV",
//       "isoNumeric": 222,
//       "currencyCode": "SVC",
//       "currencyName": "Colone",
//       "currencySymbol": "$"
//     }, {
//       "name": "Equatorial Guinea",
//       "isoAlpha2": "GQ",
//       "isoAlpha3": "GNQ",
//       "isoNumeric": 226,
//       "currencyCode": "XAF",
//       "currencyName": "Franc",
//       "currencySymbol": "FCF"
//     }, {
//       "name": "Eritrea",
//       "isoAlpha2": "ER",
//       "isoAlpha3": "ERI",
//       "isoNumeric": 232,
//       "currencyCode": "ERN",
//       "currencyName": "Nakfa",
//       "currencySymbol": "Nfk"
//     }, {
//       "name": "Estonia",
//       "isoAlpha2": "EE",
//       "isoAlpha3": "EST",
//       "isoNumeric": 233,
//       "currencyCode": "EEK",
//       "currencyName": "Kroon",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Ethiopia",
//       "isoAlpha2": "ET",
//       "isoAlpha3": "ETH",
//       "isoNumeric": 231,
//       "currencyCode": "ETB",
//       "currencyName": "Birr",
//       "currencySymbol": null
//     }, {
//       "name": "Falkland Islands",
//       "isoAlpha2": "FK",
//       "isoAlpha3": "FLK",
//       "isoNumeric": 238,
//       "currencyCode": "FKP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "Faroe Islands",
//       "isoAlpha2": "FO",
//       "isoAlpha3": "FRO",
//       "isoNumeric": 234,
//       "currencyCode": "DKK",
//       "currencyName": "Krone",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Fiji",
//       "isoAlpha2": "FJ",
//       "isoAlpha3": "FJI",
//       "isoNumeric": 242,
//       "currencyCode": "FJD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Finland",
//       "isoAlpha2": "FI",
//       "isoAlpha3": "FIN",
//       "isoNumeric": 246,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "France",
//       "isoAlpha2": "FR",
//       "isoAlpha3": "FRA",
//       "isoNumeric": 250,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "French Guiana",
//       "isoAlpha2": "GF",
//       "isoAlpha3": "GUF",
//       "isoNumeric": 254,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "French Polynesia",
//       "isoAlpha2": "PF",
//       "isoAlpha3": "PYF",
//       "isoNumeric": 258,
//       "currencyCode": "XPF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "French Southern Territories",
//       "isoAlpha2": "TF",
//       "isoAlpha3": "ATF",
//       "isoNumeric": 260,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Gabon",
//       "isoAlpha2": "GA",
//       "isoAlpha3": "GAB",
//       "isoNumeric": 266,
//       "currencyCode": "XAF",
//       "currencyName": "Franc",
//       "currencySymbol": "FCF"
//     }, {
//       "name": "Gambia",
//       "isoAlpha2": "GM",
//       "isoAlpha3": "GMB",
//       "isoNumeric": 270,
//       "currencyCode": "GMD",
//       "currencyName": "Dalasi",
//       "currencySymbol": "D"
//     }, {
//       "name": "Georgia",
//       "isoAlpha2": "GE",
//       "isoAlpha3": "GEO",
//       "isoNumeric": 268,
//       "currencyCode": "GEL",
//       "currencyName": "Lari",
//       "currencySymbol": null
//     }, {
//       "name": "Germany",
//       "isoAlpha2": "DE",
//       "isoAlpha3": "DEU",
//       "isoNumeric": 276,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Ghana",
//       "isoAlpha2": "GH",
//       "isoAlpha3": "GHA",
//       "isoNumeric": 288,
//       "currencyCode": "GHC",
//       "currencyName": "Cedi",
//       "currencySymbol": "¢"
//     }, {
//       "name": "Gibraltar",
//       "isoAlpha2": "GI",
//       "isoAlpha3": "GIB",
//       "isoNumeric": 292,
//       "currencyCode": "GIP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "Greece",
//       "isoAlpha2": "GR",
//       "isoAlpha3": "GRC",
//       "isoNumeric": 300,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Greenland",
//       "isoAlpha2": "GL",
//       "isoAlpha3": "GRL",
//       "isoNumeric": 304,
//       "currencyCode": "DKK",
//       "currencyName": "Krone",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Grenada",
//       "isoAlpha2": "GD",
//       "isoAlpha3": "GRD",
//       "isoNumeric": 308,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Guadeloupe",
//       "isoAlpha2": "GP",
//       "isoAlpha3": "GLP",
//       "isoNumeric": 312,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Guam",
//       "isoAlpha2": "GU",
//       "isoAlpha3": "GUM",
//       "isoNumeric": 316,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Guatemala",
//       "isoAlpha2": "GT",
//       "isoAlpha3": "GTM",
//       "isoNumeric": 320,
//       "currencyCode": "GTQ",
//       "currencyName": "Quetzal",
//       "currencySymbol": "Q"
//     }, {
//       "name": "Guinea",
//       "isoAlpha2": "GN",
//       "isoAlpha3": "GIN",
//       "isoNumeric": 324,
//       "currencyCode": "GNF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Guinea-Bissau",
//       "isoAlpha2": "GW",
//       "isoAlpha3": "GNB",
//       "isoNumeric": 624,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Guyana",
//       "isoAlpha2": "GY",
//       "isoAlpha3": "GUY",
//       "isoNumeric": 328,
//       "currencyCode": "GYD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Haiti",
//       "isoAlpha2": "HT",
//       "isoAlpha3": "HTI",
//       "isoNumeric": 332,
//       "currencyCode": "HTG",
//       "currencyName": "Gourde",
//       "currencySymbol": "G"
//     }, {
//       "name": "Heard Island and McDonald Islands",
//       "isoAlpha2": "HM",
//       "isoAlpha3": "HMD",
//       "isoNumeric": 334,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Honduras",
//       "isoAlpha2": "HN",
//       "isoAlpha3": "HND",
//       "isoNumeric": 340,
//       "currencyCode": "HNL",
//       "currencyName": "Lempira",
//       "currencySymbol": "L"
//     }, {
//       "name": "Hong Kong",
//       "isoAlpha2": "HK",
//       "isoAlpha3": "HKG",
//       "isoNumeric": 344,
//       "currencyCode": "HKD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Hungary",
//       "isoAlpha2": "HU",
//       "isoAlpha3": "HUN",
//       "isoNumeric": 348,
//       "currencyCode": "HUF",
//       "currencyName": "Forint",
//       "currencySymbol": "Ft"
//     }, {
//       "name": "Iceland",
//       "isoAlpha2": "IS",
//       "isoAlpha3": "ISL",
//       "isoNumeric": 352,
//       "currencyCode": "ISK",
//       "currencyName": "Krona",
//       "currencySymbol": "kr"
//     }, {
//       "name": "India",
//       "isoAlpha2": "IN",
//       "isoAlpha3": "IND",
//       "isoNumeric": 356,
//       "currencyCode": "INR",
//       "currencyName": "Rupee",
//       "currencySymbol": "₹"
//     }, {
//       "name": "Indonesia",
//       "isoAlpha2": "ID",
//       "isoAlpha3": "IDN",
//       "isoNumeric": 360,
//       "currencyCode": "IDR",
//       "currencyName": "Rupiah",
//       "currencySymbol": "Rp"
//     }, {
//       "name": "Iran",
//       "isoAlpha2": "IR",
//       "isoAlpha3": "IRN",
//       "isoNumeric": 364,
//       "currencyCode": "IRR",
//       "currencyName": "Rial",
//       "currencySymbol": "﷼"
//     }, {
//       "name": "Iraq",
//       "isoAlpha2": "IQ",
//       "isoAlpha3": "IRQ",
//       "isoNumeric": 368,
//       "currencyCode": "IQD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Ireland",
//       "isoAlpha2": "IE",
//       "isoAlpha3": "IRL",
//       "isoNumeric": 372,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Israel",
//       "isoAlpha2": "IL",
//       "isoAlpha3": "ISR",
//       "isoNumeric": 376,
//       "currencyCode": "ILS",
//       "currencyName": "Shekel",
//       "currencySymbol": "₪"
//     }, {
//       "name": "Italy",
//       "isoAlpha2": "IT",
//       "isoAlpha3": "ITA",
//       "isoNumeric": 380,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Ivory Coast",
//       "isoAlpha2": "CI",
//       "isoAlpha3": "CIV",
//       "isoNumeric": 384,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Jamaica",
//       "isoAlpha2": "JM",
//       "isoAlpha3": "JAM",
//       "isoNumeric": 388,
//       "currencyCode": "JMD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Japan",
//       "isoAlpha2": "JP",
//       "isoAlpha3": "JPN",
//       "isoNumeric": 392,
//       "currencyCode": "JPY",
//       "currencyName": "Yen",
//       "currencySymbol": "¥"
//     }, {
//       "name": "Jordan",
//       "isoAlpha2": "JO",
//       "isoAlpha3": "JOR",
//       "isoNumeric": 400,
//       "currencyCode": "JOD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Kazakhstan",
//       "isoAlpha2": "KZ",
//       "isoAlpha3": "KAZ",
//       "isoNumeric": 398,
//       "currencyCode": "KZT",
//       "currencyName": "Tenge",
//       "currencySymbol": "лв"
//     }, {
//       "name": "Kenya",
//       "isoAlpha2": "KE",
//       "isoAlpha3": "KEN",
//       "isoNumeric": 404,
//       "currencyCode": "KES",
//       "currencyName": "Shilling",
//       "currencySymbol": null
//     }, {
//       "name": "Kiribati",
//       "isoAlpha2": "KI",
//       "isoAlpha3": "KIR",
//       "isoNumeric": 296,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Kuwait",
//       "isoAlpha2": "KW",
//       "isoAlpha3": "KWT",
//       "isoNumeric": 414,
//       "currencyCode": "KWD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Kyrgyzstan",
//       "isoAlpha2": "KG",
//       "isoAlpha3": "KGZ",
//       "isoNumeric": 417,
//       "currencyCode": "KGS",
//       "currencyName": "Som",
//       "currencySymbol": "лв"
//     }, {
//       "name": "Laos",
//       "isoAlpha2": "LA",
//       "isoAlpha3": "LAO",
//       "isoNumeric": 418,
//       "currencyCode": "LAK",
//       "currencyName": "Kip",
//       "currencySymbol": "₭"
//     }, {
//       "name": "Latvia",
//       "isoAlpha2": "LV",
//       "isoAlpha3": "LVA",
//       "isoNumeric": 428,
//       "currencyCode": "LVL",
//       "currencyName": "Lat",
//       "currencySymbol": "Ls"
//     }, {
//       "name": "Lebanon",
//       "isoAlpha2": "LB",
//       "isoAlpha3": "LBN",
//       "isoNumeric": 422,
//       "currencyCode": "LBP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "Lesotho",
//       "isoAlpha2": "LS",
//       "isoAlpha3": "LSO",
//       "isoNumeric": 426,
//       "currencyCode": "LSL",
//       "currencyName": "Loti",
//       "currencySymbol": "L"
//     }, {
//       "name": "Liberia",
//       "isoAlpha2": "LR",
//       "isoAlpha3": "LBR",
//       "isoNumeric": 430,
//       "currencyCode": "LRD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Libya",
//       "isoAlpha2": "LY",
//       "isoAlpha3": "LBY",
//       "isoNumeric": 434,
//       "currencyCode": "LYD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Liechtenstein",
//       "isoAlpha2": "LI",
//       "isoAlpha3": "LIE",
//       "isoNumeric": 438,
//       "currencyCode": "CHF",
//       "currencyName": "Franc",
//       "currencySymbol": "CHF"
//     }, {
//       "name": "Lithuania",
//       "isoAlpha2": "LT",
//       "isoAlpha3": "LTU",
//       "isoNumeric": 440,
//       "currencyCode": "LTL",
//       "currencyName": "Litas",
//       "currencySymbol": "Lt"
//     }, {
//       "name": "Luxembourg",
//       "isoAlpha2": "LU",
//       "isoAlpha3": "LUX",
//       "isoNumeric": 442,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Macao",
//       "isoAlpha2": "MO",
//       "isoAlpha3": "MAC",
//       "isoNumeric": 446,
//       "currencyCode": "MOP",
//       "currencyName": "Pataca",
//       "currencySymbol": "MOP"
//     }, {
//       "name": "Macedonia",
//       "isoAlpha2": "MK",
//       "isoAlpha3": "MKD",
//       "isoNumeric": 807,
//       "currencyCode": "MKD",
//       "currencyName": "Denar",
//       "currencySymbol": "ден"
//     }, {
//       "name": "Madagascar",
//       "isoAlpha2": "MG",
//       "isoAlpha3": "MDG",
//       "isoNumeric": 450,
//       "currencyCode": "MGA",
//       "currencyName": "Ariary",
//       "currencySymbol": null
//     }, {
//       "name": "Malawi",
//       "isoAlpha2": "MW",
//       "isoAlpha3": "MWI",
//       "isoNumeric": 454,
//       "currencyCode": "MWK",
//       "currencyName": "Kwacha",
//       "currencySymbol": "MK"
//     }, {
//       "name": "Malaysia",
//       "isoAlpha2": "MY",
//       "isoAlpha3": "MYS",
//       "isoNumeric": 458,
//       "currencyCode": "MYR",
//       "currencyName": "Ringgit",
//       "currencySymbol": "RM"
//     }, {
//       "name": "Maldives",
//       "isoAlpha2": "MV",
//       "isoAlpha3": "MDV",
//       "isoNumeric": 462,
//       "currencyCode": "MVR",
//       "currencyName": "Rufiyaa",
//       "currencySymbol": "Rf"
//     }, {
//       "name": "Mali",
//       "isoAlpha2": "ML",
//       "isoAlpha3": "MLI",
//       "isoNumeric": 466,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Malta",
//       "isoAlpha2": "MT",
//       "isoAlpha3": "MLT",
//       "isoNumeric": 470,
//       "currencyCode": "MTL",
//       "currencyName": "Lira",
//       "currencySymbol": null
//     }, {
//       "name": "Marshall Islands",
//       "isoAlpha2": "MH",
//       "isoAlpha3": "MHL",
//       "isoNumeric": 584,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Martinique",
//       "isoAlpha2": "MQ",
//       "isoAlpha3": "MTQ",
//       "isoNumeric": 474,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Mauritania",
//       "isoAlpha2": "MR",
//       "isoAlpha3": "MRT",
//       "isoNumeric": 478,
//       "currencyCode": "MRO",
//       "currencyName": "Ouguiya",
//       "currencySymbol": "UM"
//     }, {
//       "name": "Mauritius",
//       "isoAlpha2": "MU",
//       "isoAlpha3": "MUS",
//       "isoNumeric": 480,
//       "currencyCode": "MUR",
//       "currencyName": "Rupee",
//       "currencySymbol": "₨"
//     }, {
//       "name": "Mayotte",
//       "isoAlpha2": "YT",
//       "isoAlpha3": "MYT",
//       "isoNumeric": 175,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Mexico",
//       "isoAlpha2": "MX",
//       "isoAlpha3": "MEX",
//       "isoNumeric": 484,
//       "currencyCode": "MXN",
//       "currencyName": "Peso",
//       "currencySymbol": "$"
//     }, {
//       "name": "Micronesia",
//       "isoAlpha2": "FM",
//       "isoAlpha3": "FSM",
//       "isoNumeric": 583,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Moldova",
//       "isoAlpha2": "MD",
//       "isoAlpha3": "MDA",
//       "isoNumeric": 498,
//       "currencyCode": "MDL",
//       "currencyName": "Leu",
//       "currencySymbol": null
//     }, {
//       "name": "Monaco",
//       "isoAlpha2": "MC",
//       "isoAlpha3": "MCO",
//       "isoNumeric": 492,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Mongolia",
//       "isoAlpha2": "MN",
//       "isoAlpha3": "MNG",
//       "isoNumeric": 496,
//       "currencyCode": "MNT",
//       "currencyName": "Tugrik",
//       "currencySymbol": "₮"
//     }, {
//       "name": "Montserrat",
//       "isoAlpha2": "MS",
//       "isoAlpha3": "MSR",
//       "isoNumeric": 500,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Morocco",
//       "isoAlpha2": "MA",
//       "isoAlpha3": "MAR",
//       "isoNumeric": 504,
//       "currencyCode": "MAD",
//       "currencyName": "Dirham",
//       "currencySymbol": null
//     }, {
//       "name": "Mozambique",
//       "isoAlpha2": "MZ",
//       "isoAlpha3": "MOZ",
//       "isoNumeric": 508,
//       "currencyCode": "MZN",
//       "currencyName": "Meticail",
//       "currencySymbol": "MT"
//     }, {
//       "name": "Myanmar",
//       "isoAlpha2": "MM",
//       "isoAlpha3": "MMR",
//       "isoNumeric": 104,
//       "currencyCode": "MMK",
//       "currencyName": "Kyat",
//       "currencySymbol": "K"
//     }, {
//       "name": "Namibia",
//       "isoAlpha2": "NA",
//       "isoAlpha3": "NAM",
//       "isoNumeric": 516,
//       "currencyCode": "NAD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Nauru",
//       "isoAlpha2": "NR",
//       "isoAlpha3": "NRU",
//       "isoNumeric": 520,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Nepal",
//       "isoAlpha2": "NP",
//       "isoAlpha3": "NPL",
//       "isoNumeric": 524,
//       "currencyCode": "NPR",
//       "currencyName": "Rupee",
//       "currencySymbol": "₨"
//     }, {
//       "name": "Netherlands",
//       "isoAlpha2": "NL",
//       "isoAlpha3": "NLD",
//       "isoNumeric": 528,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Netherlands Antilles",
//       "isoAlpha2": "AN",
//       "isoAlpha3": "ANT",
//       "isoNumeric": 530,
//       "currencyCode": "ANG",
//       "currencyName": "Guilder",
//       "currencySymbol": "ƒ"
//     }, {
//       "name": "New Caledonia",
//       "isoAlpha2": "NC",
//       "isoAlpha3": "NCL",
//       "isoNumeric": 540,
//       "currencyCode": "XPF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "New Zealand",
//       "isoAlpha2": "NZ",
//       "isoAlpha3": "NZL",
//       "isoNumeric": 554,
//       "currencyCode": "NZD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Nicaragua",
//       "isoAlpha2": "NI",
//       "isoAlpha3": "NIC",
//       "isoNumeric": 558,
//       "currencyCode": "NIO",
//       "currencyName": "Cordoba",
//       "currencySymbol": "C$"
//     }, {
//       "name": "Niger",
//       "isoAlpha2": "NE",
//       "isoAlpha3": "NER",
//       "isoNumeric": 562,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Nigeria",
//       "isoAlpha2": "NG",
//       "isoAlpha3": "NGA",
//       "isoNumeric": 566,
//       "currencyCode": "NGN",
//       "currencyName": "Naira",
//       "currencySymbol": "₦"
//     }, {
//       "name": "Niue",
//       "isoAlpha2": "NU",
//       "isoAlpha3": "NIU",
//       "isoNumeric": 570,
//       "currencyCode": "NZD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Norfolk Island",
//       "isoAlpha2": "NF",
//       "isoAlpha3": "NFK",
//       "isoNumeric": 574,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "North Korea",
//       "isoAlpha2": "KP",
//       "isoAlpha3": "PRK",
//       "isoNumeric": 408,
//       "currencyCode": "KPW",
//       "currencyName": "Won",
//       "currencySymbol": "₩"
//     }, {
//       "name": "Northern Mariana Islands",
//       "isoAlpha2": "MP",
//       "isoAlpha3": "MNP",
//       "isoNumeric": 580,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Norway",
//       "isoAlpha2": "NO",
//       "isoAlpha3": "NOR",
//       "isoNumeric": 578,
//       "currencyCode": "NOK",
//       "currencyName": "Krone",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Oman",
//       "isoAlpha2": "OM",
//       "isoAlpha3": "OMN",
//       "isoNumeric": 512,
//       "currencyCode": "OMR",
//       "currencyName": "Rial",
//       "currencySymbol": "﷼"
//     }, {
//       "name": "Pakistan",
//       "isoAlpha2": "PK",
//       "isoAlpha3": "PAK",
//       "isoNumeric": 586,
//       "currencyCode": "PKR",
//       "currencyName": "Rupee",
//       "currencySymbol": "₨"
//     }, {
//       "name": "Palau",
//       "isoAlpha2": "PW",
//       "isoAlpha3": "PLW",
//       "isoNumeric": 585,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Palestinian Territory",
//       "isoAlpha2": "PS",
//       "isoAlpha3": "PSE",
//       "isoNumeric": 275,
//       "currencyCode": "ILS",
//       "currencyName": "Shekel",
//       "currencySymbol": "₪"
//     }, {
//       "name": "Panama",
//       "isoAlpha2": "PA",
//       "isoAlpha3": "PAN",
//       "isoNumeric": 591,
//       "currencyCode": "PAB",
//       "currencyName": "Balboa",
//       "currencySymbol": "B/."
//     }, {
//       "name": "Papua New Guinea",
//       "isoAlpha2": "PG",
//       "isoAlpha3": "PNG",
//       "isoNumeric": 598,
//       "currencyCode": "PGK",
//       "currencyName": "Kina",
//       "currencySymbol": null
//     }, {
//       "name": "Paraguay",
//       "isoAlpha2": "PY",
//       "isoAlpha3": "PRY",
//       "isoNumeric": 600,
//       "currencyCode": "PYG",
//       "currencyName": "Guarani",
//       "currencySymbol": "Gs"
//     }, {
//       "name": "Peru",
//       "isoAlpha2": "PE",
//       "isoAlpha3": "PER",
//       "isoNumeric": 604,
//       "currencyCode": "PEN",
//       "currencyName": "Sol",
//       "currencySymbol": "S/."
//     }, {
//       "name": "Philippines",
//       "isoAlpha2": "PH",
//       "isoAlpha3": "PHL",
//       "isoNumeric": 608,
//       "currencyCode": "PHP",
//       "currencyName": "Peso",
//       "currencySymbol": "Php"
//     }, {
//       "name": "Pitcairn",
//       "isoAlpha2": "PN",
//       "isoAlpha3": "PCN",
//       "isoNumeric": 612,
//       "currencyCode": "NZD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Poland",
//       "isoAlpha2": "PL",
//       "isoAlpha3": "POL",
//       "isoNumeric": 616,
//       "currencyCode": "PLN",
//       "currencyName": "Zloty",
//       "currencySymbol": "zł"
//     }, {
//       "name": "Portugal",
//       "isoAlpha2": "PT",
//       "isoAlpha3": "PRT",
//       "isoNumeric": 620,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Puerto Rico",
//       "isoAlpha2": "PR",
//       "isoAlpha3": "PRI",
//       "isoNumeric": 630,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Qatar",
//       "isoAlpha2": "QA",
//       "isoAlpha3": "QAT",
//       "isoNumeric": 634,
//       "currencyCode": "QAR",
//       "currencyName": "Rial",
//       "currencySymbol": "﷼"
//     }, {
//       "name": "Republic of the Congo",
//       "isoAlpha2": "CG",
//       "isoAlpha3": "COG",
//       "isoNumeric": 178,
//       "currencyCode": "XAF",
//       "currencyName": "Franc",
//       "currencySymbol": "FCF"
//     }, {
//       "name": "Reunion",
//       "isoAlpha2": "RE",
//       "isoAlpha3": "REU",
//       "isoNumeric": 638,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Romania",
//       "isoAlpha2": "RO",
//       "isoAlpha3": "ROU",
//       "isoNumeric": 642,
//       "currencyCode": "RON",
//       "currencyName": "Leu",
//       "currencySymbol": "lei"
//     }, {
//       "name": "Russia",
//       "isoAlpha2": "RU",
//       "isoAlpha3": "RUS",
//       "isoNumeric": 643,
//       "currencyCode": "RUB",
//       "currencyName": "Ruble",
//       "currencySymbol": "руб"
//     }, {
//       "name": "Rwanda",
//       "isoAlpha2": "RW",
//       "isoAlpha3": "RWA",
//       "isoNumeric": 646,
//       "currencyCode": "RWF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Saint Helena",
//       "isoAlpha2": "SH",
//       "isoAlpha3": "SHN",
//       "isoNumeric": 654,
//       "currencyCode": "SHP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "Saint Kitts and Nevis",
//       "isoAlpha2": "KN",
//       "isoAlpha3": "KNA",
//       "isoNumeric": 659,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Saint Lucia",
//       "isoAlpha2": "LC",
//       "isoAlpha3": "LCA",
//       "isoNumeric": 662,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Saint Pierre and Miquelon",
//       "isoAlpha2": "PM",
//       "isoAlpha3": "SPM",
//       "isoNumeric": 666,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Saint Vincent and the Grenadines",
//       "isoAlpha2": "VC",
//       "isoAlpha3": "VCT",
//       "isoNumeric": 670,
//       "currencyCode": "XCD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Samoa",
//       "isoAlpha2": "WS",
//       "isoAlpha3": "WSM",
//       "isoNumeric": 882,
//       "currencyCode": "WST",
//       "currencyName": "Tala",
//       "currencySymbol": "WS$"
//     }, {
//       "name": "San Marino",
//       "isoAlpha2": "SM",
//       "isoAlpha3": "SMR",
//       "isoNumeric": 674,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Sao Tome and Principe",
//       "isoAlpha2": "ST",
//       "isoAlpha3": "STP",
//       "isoNumeric": 678,
//       "currencyCode": "STD",
//       "currencyName": "Dobra",
//       "currencySymbol": "Db"
//     }, {
//       "name": "Saudi Arabia",
//       "isoAlpha2": "SA",
//       "isoAlpha3": "SAU",
//       "isoNumeric": 682,
//       "currencyCode": "SAR",
//       "currencyName": "Rial",
//       "currencySymbol": "﷼"
//     }, {
//       "name": "Senegal",
//       "isoAlpha2": "SN",
//       "isoAlpha3": "SEN",
//       "isoNumeric": 686,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Serbia and Montenegro",
//       "isoAlpha2": "CS",
//       "isoAlpha3": "SCG",
//       "isoNumeric": 891,
//       "currencyCode": "RSD",
//       "currencyName": "Dinar",
//       "currencySymbol": "Дин"
//     }, {
//       "name": "Seychelles",
//       "isoAlpha2": "SC",
//       "isoAlpha3": "SYC",
//       "isoNumeric": 690,
//       "currencyCode": "SCR",
//       "currencyName": "Rupee",
//       "currencySymbol": "₨"
//     }, {
//       "name": "Sierra Leone",
//       "isoAlpha2": "SL",
//       "isoAlpha3": "SLE",
//       "isoNumeric": 694,
//       "currencyCode": "SLL",
//       "currencyName": "Leone",
//       "currencySymbol": "Le"
//     }, {
//       "name": "Singapore",
//       "isoAlpha2": "SG",
//       "isoAlpha3": "SGP",
//       "isoNumeric": 702,
//       "currencyCode": "SGD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Slovakia",
//       "isoAlpha2": "SK",
//       "isoAlpha3": "SVK",
//       "isoNumeric": 703,
//       "currencyCode": "SKK",
//       "currencyName": "Koruna",
//       "currencySymbol": "Sk"
//     }, {
//       "name": "Slovenia",
//       "isoAlpha2": "SI",
//       "isoAlpha3": "SVN",
//       "isoNumeric": 705,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Solomon Islands",
//       "isoAlpha2": "SB",
//       "isoAlpha3": "SLB",
//       "isoNumeric": 90,
//       "currencyCode": "SBD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Somalia",
//       "isoAlpha2": "SO",
//       "isoAlpha3": "SOM",
//       "isoNumeric": 706,
//       "currencyCode": "SOS",
//       "currencyName": "Shilling",
//       "currencySymbol": "S"
//     }, {
//       "name": "South Africa",
//       "isoAlpha2": "ZA",
//       "isoAlpha3": "ZAF",
//       "isoNumeric": 710,
//       "currencyCode": "ZAR",
//       "currencyName": "Rand",
//       "currencySymbol": "R"
//     }, {
//       "name": "South Georgia and the South Sandwich Islands",
//       "isoAlpha2": "GS",
//       "isoAlpha3": "SGS",
//       "isoNumeric": 239,
//       "currencyCode": "GBP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "South Korea",
//       "isoAlpha2": "KR",
//       "isoAlpha3": "KOR",
//       "isoNumeric": 410,
//       "currencyCode": "KRW",
//       "currencyName": "Won",
//       "currencySymbol": "₩"
//     }, {
//       "name": "Spain",
//       "isoAlpha2": "ES",
//       "isoAlpha3": "ESP",
//       "isoNumeric": 724,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Sri Lanka",
//       "isoAlpha2": "LK",
//       "isoAlpha3": "LKA",
//       "isoNumeric": 144,
//       "currencyCode": "LKR",
//       "currencyName": "Rupee",
//       "currencySymbol": "₨"
//     }, {
//       "name": "Sudan",
//       "isoAlpha2": "SD",
//       "isoAlpha3": "SDN",
//       "isoNumeric": 736,
//       "currencyCode": "SDD",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Suriname",
//       "isoAlpha2": "SR",
//       "isoAlpha3": "SUR",
//       "isoNumeric": 740,
//       "currencyCode": "SRD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Svalbard and Jan Mayen",
//       "isoAlpha2": "SJ",
//       "isoAlpha3": "SJM",
//       "isoNumeric": 744,
//       "currencyCode": "NOK",
//       "currencyName": "Krone",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Swaziland",
//       "isoAlpha2": "SZ",
//       "isoAlpha3": "SWZ",
//       "isoNumeric": 748,
//       "currencyCode": "SZL",
//       "currencyName": "Lilangeni",
//       "currencySymbol": null
//     }, {
//       "name": "Sweden",
//       "isoAlpha2": "SE",
//       "isoAlpha3": "SWE",
//       "isoNumeric": 752,
//       "currencyCode": "SEK",
//       "currencyName": "Krona",
//       "currencySymbol": "kr"
//     }, {
//       "name": "Switzerland",
//       "isoAlpha2": "CH",
//       "isoAlpha3": "CHE",
//       "isoNumeric": 756,
//       "currencyCode": "CHF",
//       "currencyName": "Franc",
//       "currencySymbol": "CHF"
//     }, {
//       "name": "Syria",
//       "isoAlpha2": "SY",
//       "isoAlpha3": "SYR",
//       "isoNumeric": 760,
//       "currencyCode": "SYP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "Taiwan",
//       "isoAlpha2": "TW",
//       "isoAlpha3": "TWN",
//       "isoNumeric": 158,
//       "currencyCode": "TWD",
//       "currencyName": "Dollar",
//       "currencySymbol": "NT$"
//     }, {
//       "name": "Tajikistan",
//       "isoAlpha2": "TJ",
//       "isoAlpha3": "TJK",
//       "isoNumeric": 762,
//       "currencyCode": "TJS",
//       "currencyName": "Somoni",
//       "currencySymbol": null
//     }, {
//       "name": "Tanzania",
//       "isoAlpha2": "TZ",
//       "isoAlpha3": "TZA",
//       "isoNumeric": 834,
//       "currencyCode": "TZS",
//       "currencyName": "Shilling",
//       "currencySymbol": null
//     }, {
//       "name": "Thailand",
//       "isoAlpha2": "TH",
//       "isoAlpha3": "THA",
//       "isoNumeric": 764,
//       "currencyCode": "THB",
//       "currencyName": "Baht",
//       "currencySymbol": "฿"
//     }, {
//       "name": "Togo",
//       "isoAlpha2": "TG",
//       "isoAlpha3": "TGO",
//       "isoNumeric": 768,
//       "currencyCode": "XOF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Tokelau",
//       "isoAlpha2": "TK",
//       "isoAlpha3": "TKL",
//       "isoNumeric": 772,
//       "currencyCode": "NZD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Tonga",
//       "isoAlpha2": "TO",
//       "isoAlpha3": "TON",
//       "isoNumeric": 776,
//       "currencyCode": "TOP",
//       "currencyName": "Paanga",
//       "currencySymbol": "T$"
//     }, {
//       "name": "Trinidad and Tobago",
//       "isoAlpha2": "TT",
//       "isoAlpha3": "TTO",
//       "isoNumeric": 780,
//       "currencyCode": "TTD",
//       "currencyName": "Dollar",
//       "currencySymbol": "TT$"
//     }, {
//       "name": "Tunisia",
//       "isoAlpha2": "TN",
//       "isoAlpha3": "TUN",
//       "isoNumeric": 788,
//       "currencyCode": "TND",
//       "currencyName": "Dinar",
//       "currencySymbol": null
//     }, {
//       "name": "Turkey",
//       "isoAlpha2": "TR",
//       "isoAlpha3": "TUR",
//       "isoNumeric": 792,
//       "currencyCode": "TRY",
//       "currencyName": "Lira",
//       "currencySymbol": "YTL"
//     }, {
//       "name": "Turkmenistan",
//       "isoAlpha2": "TM",
//       "isoAlpha3": "TKM",
//       "isoNumeric": 795,
//       "currencyCode": "TMM",
//       "currencyName": "Manat",
//       "currencySymbol": "m"
//     }, {
//       "name": "Turks and Caicos Islands",
//       "isoAlpha2": "TC",
//       "isoAlpha3": "TCA",
//       "isoNumeric": 796,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Tuvalu",
//       "isoAlpha2": "TV",
//       "isoAlpha3": "TUV",
//       "isoNumeric": 798,
//       "currencyCode": "AUD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "U.S. Virgin Islands",
//       "isoAlpha2": "VI",
//       "isoAlpha3": "VIR",
//       "isoNumeric": 850,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Uganda",
//       "isoAlpha2": "UG",
//       "isoAlpha3": "UGA",
//       "isoNumeric": 800,
//       "currencyCode": "UGX",
//       "currencyName": "Shilling",
//       "currencySymbol": null
//     }, {
//       "name": "Ukraine",
//       "isoAlpha2": "UA",
//       "isoAlpha3": "UKR",
//       "isoNumeric": 804,
//       "currencyCode": "UAH",
//       "currencyName": "Hryvnia",
//       "currencySymbol": "₴"
//     }, {
//       "name": "United Arab Emirates",
//       "isoAlpha2": "AE",
//       "isoAlpha3": "ARE",
//       "isoNumeric": 784,
//       "currencyCode": "AED",
//       "currencyName": "Dirham",
//       "currencySymbol": null
//     }, {
//       "name": "United Kingdom",
//       "isoAlpha2": "GB",
//       "isoAlpha3": "GBR",
//       "isoNumeric": 826,
//       "currencyCode": "GBP",
//       "currencyName": "Pound",
//       "currencySymbol": "£"
//     }, {
//       "name": "United States",
//       "isoAlpha2": "US",
//       "isoAlpha3": "USA",
//       "isoNumeric": 840,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "United States Minor Outlying Islands",
//       "isoAlpha2": "UM",
//       "isoAlpha3": "UMI",
//       "isoNumeric": 581,
//       "currencyCode": "USD",
//       "currencyName": "Dollar",
//       "currencySymbol": "$"
//     }, {
//       "name": "Uruguay",
//       "isoAlpha2": "UY",
//       "isoAlpha3": "URY",
//       "isoNumeric": 858,
//       "currencyCode": "UYU",
//       "currencyName": "Peso",
//       "currencySymbol": "$U"
//     }, {
//       "name": "Uzbekistan",
//       "isoAlpha2": "UZ",
//       "isoAlpha3": "UZB",
//       "isoNumeric": 860,
//       "currencyCode": "UZS",
//       "currencyName": "Som",
//       "currencySymbol": "лв"
//     }, {
//       "name": "Vanuatu",
//       "isoAlpha2": "VU",
//       "isoAlpha3": "VUT",
//       "isoNumeric": 548,
//       "currencyCode": "VUV",
//       "currencyName": "Vatu",
//       "currencySymbol": "Vt"
//     }, {
//       "name": "Vatican",
//       "isoAlpha2": "VA",
//       "isoAlpha3": "VAT",
//       "isoNumeric": 336,
//       "currencyCode": "EUR",
//       "currencyName": "Euro",
//       "currencySymbol": "€"
//     }, {
//       "name": "Venezuela",
//       "isoAlpha2": "VE",
//       "isoAlpha3": "VEN",
//       "isoNumeric": 862,
//       "currencyCode": "VEF",
//       "currencyName": "Bolivar",
//       "currencySymbol": "Bs"
//     }, {
//       "name": "Vietnam",
//       "isoAlpha2": "VN",
//       "isoAlpha3": "VNM",
//       "isoNumeric": 704,
//       "currencyCode": "VND",
//       "currencyName": "Dong",
//       "currencySymbol": "₫"
//     }, {
//       "name": "Wallis and Futuna",
//       "isoAlpha2": "WF",
//       "isoAlpha3": "WLF",
//       "isoNumeric": 876,
//       "currencyCode": "XPF",
//       "currencyName": "Franc",
//       "currencySymbol": null
//     }, {
//       "name": "Western Sahara",
//       "isoAlpha2": "EH",
//       "isoAlpha3": "ESH",
//       "isoNumeric": 732,
//       "currencyCode": "MAD",
//       "currencyName": "Dirham",
//       "currencySymbol": null
//     }, {
//       "name": "Yemen",
//       "isoAlpha2": "YE",
//       "isoAlpha3": "YEM",
//       "isoNumeric": 887,
//       "currencyCode": "YER",
//       "currencyName": "Rial",
//       "currencySymbol": "﷼"
//     }, {
//       "name": "Zambia",
//       "isoAlpha2": "ZM",
//       "isoAlpha3": "ZMB",
//       "isoNumeric": 894,
//       "currencyCode": "ZMK",
//       "currencyName": "Kwacha",
//       "currencySymbol": "ZK"
//     }, {
//       "name": "Zimbabwe",
//       "isoAlpha2": "ZW",
//       "isoAlpha3": "ZWE",
//       "isoNumeric": 716,
//       "currencyCode": "ZWD",
//       "currencyName": "Dollar",
//       "currencySymbol": "Z$"
//     }]


//   await repo.save(countries);
//   console.log(`✅ Seeded ${countries.length} countries`);
// };

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
    // await seedSettings(dataSource);
    // await seedCategories(dataSource);
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
