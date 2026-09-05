export type Locale = "en" | "fr" | "ar"

export const translations = {
  en: {
    appTitle: "NEXORA",
    tagline: "Next-Gen Enterprise Management & Outbound SaaS",
    nav: {
      dashboard: "Dashboard",
      campaigns: "Campaigns",
      leadExplorer: "Lead Explorer",
      companies: "Companies & Contacts",
      outreach: "Outreach",
      inbox: "Inbox / Responses",
      analytics: "Analytics",
      team: "Team",
      integrations: "Integrations",
      settings: "Settings"
    },
    userRole: {
      owner: "Owner",
      admin: "Admin / Campaign Mgr",
      sales_user: "Sales Specialist",
      viewer: "Viewer"
    },
    dashboard: {
      welcome: "Welcome to NEXORA Workspace",
      activeCampaigns: "Active Campaigns",
      discoveredLeads: "Discovered Leads",
      conversionRate: "Conversion Rate",
      outreachSent: "Outreach Messages",
      recentActivities: "Recent Touchpoint Timeline",
      pipelineOverview: "Sales Opportunity Pipeline"
    },
    campaigns: {
      title: "Outbound & Growth Campaigns",
      createNew: "Create New Campaign",
      searchPlaceholder: "Search campaigns...",
      targetIndustry: "Target Industry",
      dailyBudget: "Daily Budget",
      leadsCount: "Total Leads",
      converted: "Converted",
      status: "Status"
    },
    explorer: {
      title: "B2B Lead Discovery Explorer",
      subtitle: "Identify target companies and verified key decision makers",
      filterIndustry: "Industry Sector",
      filterCountry: "Country / Region",
      filterCity: "City Location",
      searchBtn: "Discover Companies",
      confidence: "Match Score"
    },
    companies: {
      title: "Company Directory & Key Contacts",
      size: "Company Size",
      phone: "Direct Phone",
      enrichBtn: "Enrich Contacts"
    },
    team: {
      title: "Workspace Team & Role Management",
      addMember: "Invite Team Member",
      role: "Assigned Role",
      ssoStatus: "LAM ID SSO Sync"
    },
    settings: {
      title: "Workspace Settings & Security",
      language: "Interface Language",
      tenantInfo: "NEXORA Tenant Mapping Info",
      auditLog: "Security Audit Logs"
    },
    pilotLogin: {
      title: "LAM Maftah Pilot Authentication",
      subtitle: "Access your assigned NEXORA workspace using your centralized LAM Maftah identity.",
      badge: "Controlled Pilot Access (Stage 6C.1)",
      continueBtn: "Continue with LAM Maftah",
      returnStandard: "Return to standard login",
      infoNote: "Authentication will be securely verified via LAM Maftah OAuth 2.0 PKCE."
    },
    auth: {
      loginWithLam: "Log In via LAM ID SSO",
      unauthorizedTitle: "Access Entitlement Revoked",
      unauthorizedDesc: "Your account does not have active entitlement access for product NEXORA. Please contact your organization administrator or support.",
      logout: "Sign Out"
    }
  },
  fr: {
    appTitle: "NEXORA",
    tagline: "Plateforme B2B de Prospection & Gestion d'Entreprise",
    nav: {
      dashboard: "Tableau de bord",
      campaigns: "Campagnes",
      leadExplorer: "Explorateur de Leads",
      companies: "Entreprises & Contacts",
      outreach: "Séquences d'Outreach",
      inbox: "Boîte de Réception",
      analytics: "Analytique",
      team: "Équipe",
      integrations: "Intégrations",
      settings: "Paramètres"
    },
    userRole: {
      owner: "Propriétaire",
      admin: "Admin / Resp. Campagne",
      sales_user: "Spécialiste Ventes",
      viewer: "Observateur"
    },
    dashboard: {
      welcome: "Bienvenue dans l'Espace NEXORA",
      activeCampaigns: "Campagnes Actives",
      discoveredLeads: "Prospects Découverts",
      conversionRate: "Taux de Conversion",
      outreachSent: "Messages Envoyés",
      recentActivities: "Chronologie des Activités",
      pipelineOverview: "Pipeline des Opportunités"
    },
    campaigns: {
      title: "Campagnes d'Acquisition B2B",
      createNew: "Créer une Campagne",
      searchPlaceholder: "Rechercher des campagnes...",
      targetIndustry: "Secteur Ciblé",
      dailyBudget: "Budget Quotidien",
      leadsCount: "Total Prospects",
      converted: "Convertis",
      status: "Statut"
    },
    explorer: {
      title: "Explorateur de Prospection B2B",
      subtitle: "Identifiez les entreprises cibles et les décideurs qualifiés",
      filterIndustry: "Secteur d'Activité",
      filterCountry: "Pays / Région",
      filterCity: "Ville",
      searchBtn: "Rechercher des Entreprises",
      confidence: "Score de Correspondance"
    },
    companies: {
      title: "Annuaire des Entreprises & Contacts",
      size: "Taille de l'Entreprise",
      phone: "Téléphone Direct",
      enrichBtn: "Enrichir les Contacts"
    },
    team: {
      title: "Gestion de l'Équipe & des Rôles",
      addMember: "Inviter un Collaborateur",
      role: "Rôle Attribué",
      ssoStatus: "Synchronisation LAM ID"
    },
    settings: {
      title: "Paramètres de l'Espace & Sécurité",
      language: "Langue de l'Interface",
      tenantInfo: "Informations de Mapping Tenant",
      auditLog: "Journaux d'Audit de Sécurité"
    },
    pilotLogin: {
      title: "Connexion Pilote LAM Maftah",
      subtitle: "Accédez à votre espace de travail NEXORA avec votre identité centralisée LAM Maftah.",
      badge: "Accès Pilote Contrôlé (Étape 6C.1)",
      continueBtn: "Continuer avec LAM Maftah",
      returnStandard: "Retour à la connexion standard",
      infoNote: "L'authentification sera vérifiée en toute sécurité via OAuth 2.0 PKCE de LAM Maftah."
    },
    auth: {
      loginWithLam: "Se connecter via LAM ID SSO",
      unauthorizedTitle: "Accès au Produit Révoqué",
      unauthorizedDesc: "Votre compte ne dispose pas d'un accès actif pour NEXORA. Veuillez contacter l'administrateur de votre organisation.",
      logout: "Déconnexion"
    }
  },
  ar: {
    appTitle: "نيكسورا NEXORA",
    tagline: "منصة إدارة المؤسسات والتسويق المباشر المتقدمة",
    nav: {
      dashboard: "لوحة التحكم",
      campaigns: "الحملات",
      leadExplorer: "مستكشف العملاء",
      companies: "الشركات وجهات الاتصال",
      outreach: "التواصل المباشر",
      inbox: "صندوق الوارد",
      analytics: "التحليلات",
      team: "فريق العمل",
      integrations: "التكاملات",
      settings: "الإعدادات"
    },
    userRole: {
      owner: "المالك",
      admin: "مدير الحملات",
      sales_user: "أخصائي مبيعات",
      viewer: "مراقب"
    },
    dashboard: {
      welcome: "مرحباً بك في مساحة عمل نيكسورا NEXORA",
      activeCampaigns: "الحملات النشطة",
      discoveredLeads: "العملاء المُكتشفين",
      conversionRate: "معدل التحويل",
      outreachSent: "رسائل التواصل",
      recentActivities: "سجل التفاعلات الأخيرة",
      pipelineOverview: "مسار الفرص البيعية"
    },
    campaigns: {
      title: "حملات النمو والتواصل المباشر",
      createNew: "إنشاء حملة جديدة",
      searchPlaceholder: "البحث في الحملات...",
      targetIndustry: "القطاع المستهدف",
      dailyBudget: "الميزانية اليومية",
      leadsCount: "إجمالي العملاء",
      converted: "تم تحويلهم",
      status: "الحالة"
    },
    explorer: {
      title: "مستكشف الشركات والعملاء المستهدفين",
      subtitle: "حدد الشركات المستهدفة وصناع القرار المعتمدين",
      filterIndustry: "قطاع الصناعة",
      filterCountry: "الدولة / المنطقة",
      filterCity: "المدينة",
      searchBtn: "استكشاف الشركات",
      confidence: "نسبة التطابق"
    },
    companies: {
      title: "دليل الشركات وجهات الاتصال",
      size: "حجم الشركة",
      phone: "الهاتف المباشر",
      enrichBtn: "إثراء بيانات الاتصال"
    },
    team: {
      title: "إدارة الفريق والأدوار",
      addMember: "دعوة عضو جديد",
      role: "الدور المخصص",
      ssoStatus: "مزامنة LAM ID SSO"
    },
    settings: {
      title: "إعدادات المساحة والأمان",
      language: "لغة الواجهة",
      tenantInfo: "معلومات ربط بيئة العمل",
      auditLog: "سجلات التدقيق الأمني"
    },
    pilotLogin: {
      title: "تسجيل الدخول التجريبي — LAM Maftah",
      subtitle: "الوصول إلى مساحة عمل نيكسورا NEXORA المخصصة لك باستخدام هوية مفتاح LAM Maftah المركزية.",
      badge: "وصول تجريبي منضبط (المرحلة 6C.1)",
      continueBtn: "المتابعة باستخدام LAM Maftah",
      returnStandard: "العودة لتسجيل الدخول القياسي",
      infoNote: "يتم التحقق من الهوية والأذونات بأمان عبر تفويض OAuth 2.0 PKCE المركزي."
    },
    auth: {
      loginWithLam: "تسجيل الدخول عبر LAM ID SSO",
      unauthorizedTitle: "تم إلغاء صلاحية الوصول",
      unauthorizedDesc: "حسابك لا يمتلك صلاحية نشطة للوصول إلى منتج NEXORA. يرجى التواصل مع مسؤول المؤسسة.",
      logout: "تسجيل الخروج"
    }
  }
}
