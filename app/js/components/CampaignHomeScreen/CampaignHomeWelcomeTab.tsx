import CardWithTitle from '../CardWithTitle';
import type { CampaignHomeTabDef } from './campaignHomeTabDef';
import { CampaignHomeTabFrame } from './CampaignHomeTabFrame';

export function CampaignHomeWelcomeTab() {
	return (
		<CampaignHomeTabFrame>
			<CardWithTitle title="Welcome" subtitle="Thanks for playing Minion Battles">
				<div className="px-6 py-5 space-y-4">
					<p>
						Thank you for playing my game!
						<br />
						It's complicated to explain, but I'm sure you can figure it out!
					</p>
					<p className="mb-2">
						<h2 className="text-lg font-bold">How to Play</h2>
						You select which ability to use from the bottom of the screen, and then select a target for it.
						<br />
						The game plays out frame by frame until its ready for your input.
						<br />
						If you are playing multiplayer, it will pause for other players to take their turn.  There is an indicator for who the game is waiting on.
					</p>
					<p className="mb-2">
						<h3 className="text-md font-bold">Join Mission</h3>
						Use the Join Mission tab to join a friends mission.
						<br />
						Ask them what their mission code is, and make sure they're still in the lobby.  Click the join button to join them!
					</p>
					<p className="mb-2">
						<h3 className="text-md font-bold">Characters</h3>
						The Characters tab allows you to create a lobby, either for a single player game or a multiplayer one.
					</p>
					<p>
						<h2 className="text-lg font-bold ">Credits</h2>
						<h3 className="text-md font-bold">Music</h3>
						Title Kevin MacLeod (incompetech.com)
						<br />
						Licensed under Creative Commons: By Attribution 4.0
						<br />
						https://creativecommons.org/licenses/by/4.0/
					</p>
				</div>
			</CardWithTitle>
		</CampaignHomeTabFrame>
	);
}

export const welcomeTab: CampaignHomeTabDef = {
	id: 'welcome',
	label: 'Welcome',
	isVisible: () => true,
	render: () => <CampaignHomeWelcomeTab />,
};
