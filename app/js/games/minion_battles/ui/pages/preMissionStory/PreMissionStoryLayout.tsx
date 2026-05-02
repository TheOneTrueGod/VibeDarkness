import React from 'react';

interface PreMissionStoryLayoutProps {
    backgroundImage?: string;
    bgOpacity: number;
    /** Dialogue uses bottom-aligned VN layout; choices / votes center in the scroll area. */
    contentJustify: 'end' | 'center';
    children: React.ReactNode;
}

export default function PreMissionStoryLayout({
    backgroundImage,
    bgOpacity,
    contentJustify,
    children,
}: PreMissionStoryLayoutProps) {
    const justify = contentJustify === 'center' ? 'justify-center' : 'justify-end';

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
            {backgroundImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                    style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                />
            )}
            <div
                className={`relative z-10 flex-1 flex flex-col min-h-0 ${justify} items-center overflow-y-auto overflow-x-hidden`}
            >
                <div
                    className={`w-full max-w-[1200px] flex flex-col flex-1 min-h-0 ${justify} mx-auto px-3 sm:px-6 min-w-0`}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
