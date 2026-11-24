import React from 'react';
import {
  CheckCircle2,
  Globe,
  Mail,
  Menu,
  MessageSquare,
  Send,
  Share2,
  X as CloseIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import defaultBackdropImg from '@/assets/images/contact_hero_backdrop_1795364222845.jpg';

export interface ContactSocialLink {
  id: string;
  name: string;
  href: string;
  iconSrc?: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  message: string;
  projectType: string[];
}

export interface ContactSectionProps {
  /**
   * The title for the contact section.
   */
  title?: string;
  /**
   * The subtitle or main message for the introductory part.
   */
  mainMessage?: string;
  /**
   * The contact email to display.
   */
  contactEmail?: string;
  /**
   * Optional brand/workspace label shown in the top bar.
   */
  brandName?: string;
  /**
   * Optional top navigation links.
   */
  navLinks?: Array<{ label: string; href: string; onClick?: () => void }>;
  /**
   * Optional CTA button text in the top bar.
   */
  ctaLabel?: string;
  /**
   * Optional callback when top bar CTA is clicked.
   */
  onCtaClick?: () => void;
  /**
   * Selectable inquiry/project topics rendered with shadcn Checkbox controls.
   */
  projectTypeOptions?: string[];
  /**
   * Array of social media links. Each object can include an 'id', 'name', 'href', and optional 'iconSrc'.
   */
  socialLinks?: ContactSocialLink[];
  /**
   * Background image path or URL. Defaults to bundled architectural slate studio backdrop.
   */
  backgroundImageSrc?: string;
  /**
   * Callback function when the form is submitted.
   */
  onSubmit?: (data: ContactFormData) => void;
}

interface BubbleSpec {
  size: number;
  left: number;
  top: number;
  delay: number;
  duration: number;
  xOffset: number;
}

const BUBBLE_SPECS: BubbleSpec[] = [
  { size: 16, left: 8, top: 82, delay: 0.4, duration: 16, xOffset: -0.6 },
  { size: 22, left: 16, top: 68, delay: 2.1, duration: 21, xOffset: 0.8 },
  { size: 12, left: 25, top: 88, delay: 4.3, duration: 14, xOffset: -0.4 },
  { size: 26, left: 34, top: 74, delay: 1.2, duration: 23, xOffset: 0.5 },
  { size: 14, left: 43, top: 92, delay: 5.7, duration: 17, xOffset: -0.9 },
  { size: 20, left: 52, top: 79, delay: 0.9, duration: 19, xOffset: 0.7 },
  { size: 28, left: 61, top: 86, delay: 3.4, duration: 25, xOffset: -0.5 },
  { size: 15, left: 70, top: 72, delay: 6.2, duration: 15, xOffset: 0.9 },
  { size: 24, left: 79, top: 90, delay: 2.8, duration: 22, xOffset: -0.7 },
  { size: 18, left: 88, top: 76, delay: 1.7, duration: 18, xOffset: 0.4 },
  { size: 13, left: 12, top: 45, delay: 4.9, duration: 20, xOffset: 0.6 },
  { size: 21, left: 39, top: 53, delay: 3.1, duration: 24, xOffset: -0.8 },
  { size: 17, left: 64, top: 48, delay: 7.0, duration: 16, xOffset: 0.3 },
  { size: 23, left: 84, top: 58, delay: 5.1, duration: 21, xOffset: -0.6 },
  { size: 14, left: 94, top: 84, delay: 2.4, duration: 19, xOffset: -0.3 },
];

const defaultSocialLinks: ContactSocialLink[] = [
  { id: '1', name: 'Portal Web', href: '#portal' },
  { id: '2', name: 'Saluran Tim', href: '#team-channel' },
  { id: '3', name: 'Kolaborasi', href: '#network' },
];

const defaultProjectTypeOptions = [
  'Website',
  'Mobile App',
  'Web App',
  'E-Commerce',
  'Brand Identity',
  '3D & Animation',
  'Social Media Marketing',
  'Brand Strategy & Consulting',
  'Other',
];

const renderFallbackSocialIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('web') || lower.includes('portal') || lower.includes('globe')) {
    return <Globe className="h-4 w-4" />;
  }
  if (lower.includes('team') || lower.includes('chat') || lower.includes('saluran')) {
    return <MessageSquare className="h-4 w-4" />;
  }
  if (lower === 'x') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  return <Share2 className="h-4 w-4" />;
};

export const ContactSection: React.FC<ContactSectionProps> = ({
  title = 'We can turn your dream project into reality',
  mainMessage = "Let's talk!",
  contactEmail = 'hello@prodtrack-mes.local',
  brandName = 'ProdTrack Support',
  navLinks = [
    { label: 'Overview', href: '#overview' },
    { label: 'Services', href: '#services' },
    { label: 'Workflows', href: '#workflows' },
    { label: 'Documentation', href: '#docs' },
  ],
  ctaLabel = 'Get in touch',
  onCtaClick,
  projectTypeOptions = defaultProjectTypeOptions,
  socialLinks = defaultSocialLinks,
  backgroundImageSrc = defaultBackdropImg,
  onSubmit,
}) => {
  const [formData, setFormData] = React.useState<ContactFormData>({
    name: '',
    email: '',
    message: '',
    projectType: [],
  });
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isFormExpanded, setIsFormExpanded] = React.useState(true);
  const [failedIconIds, setFailedIconIds] = React.useState<Record<string, boolean>>({});
  const formRef = React.useRef<HTMLFormElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setIsSubmitted(false);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (type: string, checked: boolean) => {
    setIsSubmitted(false);
    setFormData((prev) => {
      const currentTypes = prev.projectType;
      if (checked) {
        return currentTypes.includes(type)
          ? prev
          : { ...prev, projectType: [...currentTypes, type] };
      }
      return { ...prev, projectType: currentTypes.filter((t) => t !== type) };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(formData);
    setIsSubmitted(true);
    setFormData({
      name: '',
      email: '',
      message: '',
      projectType: [],
    });
  };

  const scrollToForm = () => {
    if (onCtaClick) {
      onCtaClick();
      return;
    }
    setIsFormExpanded(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  return (
    <section className="relative min-h-[calc(100vh-8rem)] w-full overflow-hidden rounded-2xl border border-border bg-slate-950 text-foreground shadow-2xl">
      {/* Background Image & Contrast Scrim */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-500 ease-in-out"
        style={{ backgroundImage: `url(${backgroundImageSrc})` }}
        aria-hidden="true"
      >
        <div className="contact-hero-scrim absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/75 to-slate-900/85" />

        {/* Deterministic Ambient Bubbles */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {BUBBLE_SPECS.map((bubble, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white/15 animate-bubble opacity-0"
              style={
                {
                  width: `${bubble.size}px`,
                  height: `${bubble.size}px`,
                  left: `${bubble.left}%`,
                  top: `${bubble.top}%`,
                  animationDelay: `${bubble.delay}s`,
                  '--animation-duration': `${bubble.duration}s`,
                  '--rand-x-offset': bubble.xOffset,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      {/* Main Content Overlay */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-between p-4 md:p-8 lg:p-10">
        {/* Top Navigation Bar */}
        <nav className="mb-6 w-full max-w-7xl rounded-xl border border-border bg-card/90 p-3.5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-lg font-bold tracking-tight text-foreground">{brandName}</span>
            </div>

            <div className="hidden items-center space-x-6 md:flex">
              {navLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                    }
                  }}
                  className="text-sm font-medium text-foreground/85 transition-colors hover:text-primary"
                >
                  {item.label}
                </a>
              ))}
              <Button type="button" variant="default" onClick={scrollToForm}>
                {ctaLabel}
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={isMobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <CloseIcon className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>

          {isMobileMenuOpen && (
            <div className="mt-3 flex flex-col space-y-2 border-t border-border pt-3 md:hidden">
              {navLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick();
                    }
                    setIsMobileMenuOpen(false);
                  }}
                  className="rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/90 hover:bg-accent"
                >
                  {item.label}
                </a>
              ))}
              <Button
                type="button"
                variant="default"
                className="w-full"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  scrollToForm();
                }}
              >
                {ctaLabel}
              </Button>
            </div>
          )}
        </nav>

        {/* Main Section Grid */}
        <div className="grid w-full max-w-7xl flex-grow grid-cols-1 items-center gap-8 py-2 lg:grid-cols-2 lg:gap-12">
          {/* Left Side: Hero Headline (high-contrast white text over dark slate scrim) */}
          <div className="contact-hero-on-dark flex flex-col justify-end space-y-4 p-2 lg:p-6">
            <span className="w-fit rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Direct Engineering &amp; Support Desk
            </span>
            <h1 className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md md:text-5xl">
              {title}
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-slate-200 md:text-base">
              Sampaikan kebutuhan integrasi sistem, penyesuaian BOM, atau kendala operasional lantai produksi secara terstruktur.
            </p>
          </div>

          {/* Right Side: Contact Form Card */}
          <div className="rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-md md:p-8">
            <div className={`flex items-center justify-between gap-3 ${isFormExpanded ? 'mb-4' : ''}`}>
              <h2 className="text-2xl font-bold text-card-foreground">{mainMessage}</h2>
              <button
                type="button"
                onClick={() => setIsFormExpanded((prev) => !prev)}
                aria-expanded={isFormExpanded}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground whitespace-nowrap shrink-0"
              >
                {isFormExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span>{isFormExpanded ? 'Tutup Form' : 'Buka Form'}</span>
              </button>
            </div>

            {isFormExpanded && (
              <>

            {/* Email & Socials */}
            <div className="mb-6">
              <p className="mb-1.5 text-sm text-muted-foreground">Mail us at</p>
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center space-x-2 font-medium text-primary hover:underline"
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span>{contactEmail}</span>
              </a>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OR</span>
                {socialLinks.map((link) => {
                  const hasValidExternalIcon = Boolean(link.iconSrc && !failedIconIds[link.id]);
                  return (
                    <Button key={link.id} variant="outline" size="icon" asChild>
                      <a
                        href={link.href}
                        aria-label={link.name}
                        title={link.name}
                        onClick={(e) => {
                          if (link.href.startsWith('#')) {
                            e.preventDefault();
                            scrollToForm();
                          }
                        }}
                      >
                        {hasValidExternalIcon ? (
                          <img
                            src={link.iconSrc}
                            alt={link.name}
                            className="h-4 w-4 dark:invert"
                            onError={() =>
                              setFailedIconIds((prev) => ({ ...prev, [link.id]: true }))
                            }
                          />
                        ) : (
                          renderFallbackSocialIcon(link.name)
                        )}
                      </a>
                    </Button>
                  );
                })}
              </div>
            </div>

            <hr className="my-5 border-border" />

            {isSubmitted && (
              <div
                role="status"
                className="mb-5 flex items-start space-x-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-sm text-emerald-600 dark:text-emerald-300"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-semibold">Pesan berhasil dikirim</p>
                  <p className="text-xs opacity-90">
                    Terima kasih telah menghubungi tim kami. Permintaan Anda telah dicatat.
                  </p>
                </div>
              </div>
            )}

            {/* Form */}
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Leave us a brief message and select the relevant topic below.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Your name</Label>
                  <Input
                    id="contact-name"
                    name="name"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    name="email"
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-message">Briefly describe your project idea or request</Label>
                <Textarea
                  id="contact-message"
                  name="message"
                  placeholder="Tuliskan detail kebutuhan atau kendala Anda di sini..."
                  rows={4}
                  value={formData.message}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-3">
                <Label>I&apos;m looking for...</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {projectTypeOptions.map((option) => {
                    const optionId = `project-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                    return (
                      <div key={option} className="flex items-center space-x-2">
                        <Checkbox
                          id={optionId}
                          checked={formData.projectType.includes(option)}
                          onCheckedChange={(checked) =>
                            handleCheckboxChange(option, checked === true)
                          }
                        />
                        <Label
                          htmlFor={optionId}
                          className="cursor-pointer text-xs font-normal leading-snug sm:text-sm"
                        >
                          {option}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" className="w-full">
                <Send className="mr-2 h-4 w-4" />
                Send a message
              </Button>
            </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
