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
      title: "Sign in with LAM Maftah",
      subtitle: "Access your assigned NEXORA workspace using your centralized LAM Maftah identity.",
      continueBtn: "Continue with LAM Maftah",
      securedBy: "Secured by LAM Maftah",
      switchWorkspace: "Switch workspace",
      cancelReturn: "Cancel and return to sign in",
      selectWorkspaceTitle: "Select Workspace",
      selectWorkspaceSubtitle: "Choose an organization to continue into NEXORA"
    },
    auth: {
      loginWithLam: "Sign in with LAM Maftah",
      unauthorizedTitle: "Access Entitlement Revoked",
      unauthorizedDesc: "You do not currently have access to NEXORA. Please contact your organization administrator or support.",
      logout: "Sign Out",
      switchWorkspace: "Switch workspace"
    },
    authErrors: {
      access_not_authorized: "You do not currently have access to NEXORA.",
      transaction_expired: "Your sign-in session expired. Please sign in again.",
      workspace_not_provisioned: "This workspace is not yet available in NEXORA.",
      membership_not_active: "Your NEXORA access is currently inactive.",
      organization_access_denied: "You no longer have access to this workspace.",
      session_creation_failed: "We could not complete your sign-in. Please try again.",
      session_revocation_failed: "Your session could not be fully closed. Please sign in again.",
      no_active_login_transaction: "No active sign-in session found. Please sign in again.",
      invalid_selection: "Invalid workspace selection. Please try again.",
      failed_to_load_organizations: "Could not load available workspaces. Please sign in again.",
      identity_link_conflict: "An account configuration conflict was detected. Please contact support.",
      membership_not_provisioned: "Your user account has not been provisioned for this workspace.",
      credential_decryption_failed: "Your sign-in data could not be verified securely. Please sign in again.",
      invalid_oauth_state: "Sign-in state was invalid. Please sign in again.",
      token_exchange_failed: "Could not complete authorization with provider. Please try again.",
      missing_id_token: "Identity verification token is missing. Please sign in again.",
      invalid_id_token: "Identity verification token is invalid. Please sign in again.",
      oauth_session_invalid: "Your provider session is invalid or expired. Please sign in again.",
      unexpected_status: "An unexpected authorization response was received. Please try again.",
      generic: "An authentication error occurred. Please try again."
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
      title: "Connexion avec LAM Maftah",
      subtitle: "Accédez à votre espace de travail NEXORA avec votre identité centralisée LAM Maftah.",
      continueBtn: "Continuer avec LAM Maftah",
      securedBy: "Sécurisé par LAM Maftah",
      switchWorkspace: "Changer d'espace",
      cancelReturn: "Annuler et retourner à la connexion",
      selectWorkspaceTitle: "Sélectionner un espace de travail",
      selectWorkspaceSubtitle: "Choisissez une organisation pour continuer vers NEXORA"
    },
    auth: {
      loginWithLam: "Se connecter avec LAM Maftah",
      unauthorizedTitle: "Accès au Produit Révoqué",
      unauthorizedDesc: "Vous n'avez pas actuellement accès à NEXORA. Veuillez contacter l'administrateur de votre organisation.",
      logout: "Déconnexion",
      switchWorkspace: "Changer d'espace"
    },
    authErrors: {
      access_not_authorized: "Vous n'avez pas actuellement accès à NEXORA.",
      transaction_expired: "Votre session de connexion a expiré. Veuillez vous reconnecter.",
      workspace_not_provisioned: "Cet espace de travail n'est pas encore disponible dans NEXORA.",
      membership_not_active: "Votre accès à NEXORA est actuellement inactif.",
      organization_access_denied: "Vous n'avez plus accès à cet espace de travail.",
      session_creation_failed: "Impossible de finaliser votre connexion. Veuillez réessayer.",
      session_revocation_failed: "Votre session n'a pas pu être totalement fermée. Veuillez vous reconnecter.",
      no_active_login_transaction: "Aucune session de connexion active trouvée. Veuillez vous reconnecter.",
      invalid_selection: "Sélection d'espace de travail invalide. Veuillez réessayer.",
      failed_to_load_organizations: "Impossible de charger les espaces de travail disponibles. Veuillez vous reconnecter.",
      identity_link_conflict: "Un conflit de configuration de compte a été détecté. Veuillez contacter le support.",
      membership_not_provisioned: "Votre compte utilisateur n'a pas été configuré pour cet espace.",
      credential_decryption_failed: "Vos données de connexion n'ont pas pu être vérifiées en toute sécurité. Veuillez vous reconnecter.",
      invalid_oauth_state: "L'état de la connexion était invalide. Veuillez vous reconnecter.",
      token_exchange_failed: "Impossible de finaliser l'autorisation avec le fournisseur. Veuillez réessayer.",
      missing_id_token: "Le jeton de vérification d'identité est manquant. Veuillez vous reconnecter.",
      invalid_id_token: "Le jeton de vérification d'identité est invalide. Veuillez vous reconnecter.",
      oauth_session_invalid: "Votre session fournisseur est invalide ou a expiré. Veuillez vous reconnecter.",
      unexpected_status: "Une réponse d'autorisation inattendue a été reçue. Veuillez réessayer.",
      generic: "Une erreur d'authentification est survenue. Veuillez réessayer."
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
      title: "تسجيل الدخول باستخدام LAM Maftah",
      subtitle: "الوصول إلى مساحة عمل نيكسورا NEXORA المخصصة لك باستخدام هوية مفتاح LAM Maftah المركزية.",
      continueBtn: "المتابعة باستخدام LAM Maftah",
      securedBy: "محمي بواسطة LAM Maftah",
      switchWorkspace: "تبديل مساحة العمل",
      cancelReturn: "إلغاء والعودة إلى تسجيل الدخول",
      selectWorkspaceTitle: "اختر مساحة العمل",
      selectWorkspaceSubtitle: "اختر مؤسسة للمتابعة إلى نيكسورا NEXORA"
    },
    auth: {
      loginWithLam: "تسجيل الدخول عبر LAM Maftah",
      unauthorizedTitle: "تم إلغاء صلاحية الوصول",
      unauthorizedDesc: "ليس لديك صلاحية الوصول إلى نيكسورا NEXORA حالياً. يرجى التواصل مع مسؤول المؤسسة.",
      logout: "تسجيل الخروج",
      switchWorkspace: "تبديل مساحة العمل"
    },
    authErrors: {
      access_not_authorized: "ليس لديك صلاحية الوصول إلى نيكسورا NEXORA حالياً.",
      transaction_expired: "انتهت صلاحية جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.",
      workspace_not_provisioned: "مساحة العمل هذه غير متوفرة في نيكسورا NEXORA بعد.",
      membership_not_active: "صلاحية وصولك إلى نيكسورا NEXORA غير نشطة حالياً.",
      organization_access_denied: "لم يعد لديك صلاحية الوصول إلى مساحة العمل هذه.",
      session_creation_failed: "تعذر إكمال تسجيل الدخول. يرجى المحاولة مرة أخرى.",
      session_revocation_failed: "تعذر إغلاق جلستك بالكامل. يرجى تسجيل الدخول مرة أخرى.",
      no_active_login_transaction: "لم يتم العثور على جلسة تسجيل دخول نشطة. يرجى تسجيل الدخول مجدداً.",
      invalid_selection: "اختيار غير صالح لمساحة العمل. يرجى المحاولة مرة أخرى.",
      failed_to_load_organizations: "تعذر تحميل مساحات العمل المتاحة. يرجى تسجيل الدخول مجدداً.",
      identity_link_conflict: "تم اكتشاف تعارض في إعدادات الحساب. يرجى التواصل مع الدعم الفني.",
      membership_not_provisioned: "لم يتم تهيئة حساب المستخدم الخاص بك لمساحة العمل هذه.",
      credential_decryption_failed: "تعذر التحقق من بيانات تسجيل الدخول بأمان. يرجى تسجيل الدخول مجدداً.",
      invalid_oauth_state: "حالة تسجيل الدخول غير صالحة. يرجى تسجيل الدخول مجدداً.",
      token_exchange_failed: "تعذر إكمال المصادقة مع المزود. يرجى المحاولة مرة أخرى.",
      missing_id_token: "رمز التحقق من الهوية مفقود. يرجى تسجيل الدخول مجدداً.",
      invalid_id_token: "رمز التحقق من الهوية غير صالح. يرجى تسجيل الدخول مجدداً.",
      oauth_session_invalid: "جلسة المزود غير صالحة أو منتهية الصلاحية. يرجى تسجيل الدخول مجدداً.",
      unexpected_status: "تم استلام استجابة مصادقة غير متوقعة. يرجى المحاولة مرة أخرى.",
      generic: "حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى."
    }
  }
}

/**
 * Return customer-friendly localized auth error message.
 * Strictly prevents leaking raw internal error codes or database/OAuth details to end users.
 */
export function getLocalizedAuthError(errorCode: string | null | undefined, locale: Locale = "en"): string {
  if (!errorCode) {
    return ""
  }

  const dict = translations[locale]?.authErrors || translations.en.authErrors
  const sanitizedCode = errorCode.trim().toLowerCase()

  if (sanitizedCode in dict) {
    return dict[sanitizedCode as keyof typeof dict]
  }

  // Common pattern matches for sanitized error categorization
  if (sanitizedCode.includes("expire")) {
    return dict.transaction_expired
  }
  if (sanitizedCode.includes("denied") || sanitizedCode.includes("unauthorized") || sanitizedCode.includes("not_authorized")) {
    return dict.access_not_authorized
  }
  if (sanitizedCode.includes("provision")) {
    return dict.workspace_not_provisioned
  }
  if (sanitizedCode.includes("token") || sanitizedCode.includes("oauth") || sanitizedCode.includes("state")) {
    return dict.token_exchange_failed
  }

  return dict.generic
}

