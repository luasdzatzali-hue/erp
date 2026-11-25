import React from 'react';
import { ContactFormData, ContactSection } from '@/components/ui/contact';

export default function DemoContactSection() {
  const [lastSubmitted, setLastSubmitted] = React.useState<ContactFormData | null>(null);

  const customSocialLinks = [
    { id: '1', name: 'Portal Web', href: '#portal' },
    { id: '2', name: 'Saluran Tim', href: '#team' },
    { id: '3', name: 'Kolaborasi', href: '#collaborate' },
  ];

  const handleFormSubmit = (data: ContactFormData) => {
    setLastSubmitted(data);
  };

  return (
    <div className="min-h-screen w-full space-y-4">
      {lastSubmitted && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-ink-emerald"
        >
          <span className="font-semibold">Ringkasan Terkirim:</span> {lastSubmitted.name} ({lastSubmitted.email}) —{' '}
          {lastSubmitted.projectType.length > 0
            ? lastSubmitted.projectType.join(', ')
            : 'Tanpa kategori khusus'}
        </div>
      )}

      <ContactSection
        title="Let's build something extraordinary together"
        mainMessage="Drop us a line!"
        contactEmail="hello@prodtrack-mes.local"
        socialLinks={customSocialLinks}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
