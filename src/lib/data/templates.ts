// LaTeX resume template definitions

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  preview: string; // emoji/icon indicator
  previewImageUrl?: string;
  previewImageAlt?: string;
  hasPhoto: boolean;
  promptInstructions: string;
}

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: "modern-professional",
    name: "Modern Professional",
    description: "Clean two-column design with colored sidebar, profile photo support, and modern typography",
    color: "from-blue-500 to-indigo-600",
    preview: "💼",
    previewImageUrl: "/template-previews/modern-professional.png",
    previewImageAlt: "Modern Professional resume preview",
    hasPhoto: true,
    promptInstructions: `Create a MODERN PROFESSIONAL resume with a polished, ATS-friendly two-column layout.

Use this LaTeX setup pattern (same packages and principles):
\\documentclass[a4paper,10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=0.45in]{geometry}
\\usepackage{xcolor,tikz,fontawesome5,enumitem,hyperref,graphicx,parskip,array}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\definecolor{primary}{HTML}{2563EB}
\\definecolor{sidebar}{HTML}{EEF2FF}
\\definecolor{textdark}{HTML}{111827}
\\definecolor{textmuted}{HTML}{4B5563}

Design contract:
- Use minipage two-column layout: left 0.31\\linewidth, right 0.65\\linewidth, with \\hfill.
- Left sidebar has light background and compact contact + skills chips.
- Right column has name headline, thin accent rule, clean section hierarchy.
- Use unnumbered sections only (never numbered headings).
- Use tight bullets: \\begin{itemize}[leftmargin=*,nosep,label={\\textbullet}].
- Keep spacing balanced and professional. No visual clutter.
- If no data for a section, omit it.
- No placeholder/fake content.
- Keep everything pdflatex-safe and one page when possible.
- If photo is present, clip with tikz only inside \\begin{scope}...\\end{scope}.`,
  },
  {
    id: "classic-elegant",
    name: "Classic Elegant",
    description: "Traditional single-column. Timeless design ideal for corporate and finance roles",
    color: "from-gray-600 to-gray-800",
    preview: "🎩",
    previewImageUrl: "/template-previews/classic-elegant.png",
    previewImageAlt: "Classic Elegant resume preview",
    hasPhoto: false,
    promptInstructions: `Create a CLASSIC ELEGANT resume using this EXACT LaTeX structure:

\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{charter}
\\usepackage[left=0.75in,right=0.75in,top=0.6in,bottom=0.6in]{geometry}
\\usepackage{enumitem,hyperref,titlesec,xcolor,parskip}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}

CRITICAL DESIGN RULES:
- Single column, classic layout; no graphics, no tikz, no photos
- Name centered at top in large serif style
- Contact line centered below name using separators
- Section headers with clean rule lines and no numbering
- Experience format: company/role/date with compact bullets
- Keep black/dark-gray palette only
- Omit empty sections and never add fake entries
- Keep to one page if possible`,
  },
  {
    id: "creative-modern",
    name: "Creative Modern",
    description: "Bold accent colors, icons, and a creative header with photo. Great for tech & design",
    color: "from-purple-500 to-pink-600",
    preview: "🎨",
    previewImageUrl: "/template-previews/creative-modern.png",
    previewImageAlt: "Creative Modern resume preview",
    hasPhoto: true,
    promptInstructions: `Create a CREATIVE MODERN resume using this EXACT LaTeX structure:

\\documentclass[a4paper,10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[left=0.6in,right=0.6in,top=0.4in,bottom=0.5in]{geometry}
\\usepackage{xcolor,tikz,fontawesome5,enumitem,hyperref,titlesec,graphicx,parskip}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}

CRITICAL DESIGN RULES:
- White page background with tasteful accent color
- Strong header hierarchy with clean spacing
- Unnumbered section headings only
- Compact bullets and clear role/project emphasis
- If photo exists, circular clip inside tikz scope only
- Keep design modern but professional, no clutter
- Omit empty sections and never invent data`,
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    description: "Ultra-clean, lots of whitespace. Maximum readability and ATS-friendliness",
    color: "from-emerald-500 to-teal-600",
    preview: "✨",
    previewImageUrl: "/template-previews/minimal-clean.png",
    previewImageAlt: "Minimal Clean resume preview",
    hasPhoto: false,
    promptInstructions: `Create a MINIMAL CLEAN resume using this EXACT LaTeX structure:

\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage[left=0.8in,right=0.8in,top=0.7in,bottom=0.7in]{geometry}
\\usepackage{enumitem,hyperref,titlesec,xcolor,parskip}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}

CRITICAL DESIGN RULES:
- Minimal single-column ATS-first style
- No tikz, no graphics, no photo
- Strong text hierarchy with simple section rules
- Unnumbered sections and compact bullets
- Omit empty sections, no placeholders
- Keep clean whitespace and one-page readability`,
  },
  {
    id: "tech-developer",
    name: "Tech Developer",
    description: "Designed for developers. Skill tags, project links, and code-inspired design",
    color: "from-cyan-500 to-blue-600",
    preview: "💻",
    previewImageUrl: "/template-previews/tech-developer.png",
    previewImageAlt: "Tech Developer resume preview",
    hasPhoto: true,
    promptInstructions: `Create a TECH DEVELOPER resume using this EXACT LaTeX structure:

\\documentclass[a4paper,10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[left=0.6in,right=0.6in,top=0.5in,bottom=0.5in]{geometry}
\\usepackage{xcolor,tikz,fontawesome5,enumitem,hyperref,titlesec,graphicx,parskip}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}

CRITICAL DESIGN RULES:
- White background with cyan accent system
- Clear header, contact icons, and scannable sections
- Highlight projects and technical skills cleanly
- Unnumbered sections only
- Keep tikz minimal; clip photo only inside scope when present
- Omit empty sections, no fake content`,
  },
  {
    id: "executive-premium",
    name: "Executive Premium",
    description: "Sophisticated two-column layout for senior roles with refined typography",
    color: "from-amber-500 to-yellow-600",
    preview: "👔",
    previewImageUrl: "/template-previews/executive-premium.png",
    previewImageAlt: "Executive Premium resume preview",
    hasPhoto: true,
    promptInstructions: `Create an EXECUTIVE PREMIUM resume using this EXACT LaTeX structure:

\\documentclass[a4paper,10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{charter}
\\usepackage[margin=0.45in]{geometry}
\\usepackage{xcolor,tikz,fontawesome5,enumitem,hyperref,titlesec,graphicx,parskip}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}

CRITICAL DESIGN RULES:
- Refined two-column executive style with light palette
- Right column carries main narrative and achievements
- Left column contains concise profile/contact/support info
- Unnumbered sections and elegant spacing
- Photo clip only inside scope when present
- Omit empty sections; do not invent content`,
  },
];

export function getTemplateById(id: string): ResumeTemplate {
  return RESUME_TEMPLATES.find((t) => t.id === id) || RESUME_TEMPLATES[0];
}
