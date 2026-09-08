import type { CampaignHomeTabDef } from './campaignHomeTabDef';

export function CampaignHomeWelcomeTab() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-center min-h-[200px]">
				<span className="text-2xl text-muted">Welcome</span>
			</div>
			<div className="flex items-center justify-center min-h-[200px]">
				<span className="text-m text-muted">Welcome</span>
			</div>
		</div>
	);
}

export const welcomeTab: CampaignHomeTabDef = {
	id: 'welcome',
	label: 'Welcome',
	isVisible: () => true,
	narrowContent: true,
	render: () => <CampaignHomeWelcomeTab />,
};
