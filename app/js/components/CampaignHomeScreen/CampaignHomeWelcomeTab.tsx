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
						<br /><br/>
						You select which ability to use from the bottom of the screen, and then select a target for it.
						<br />
						The game plays out frame by frame until its ready for your input.
						<br/>
						If you are playing multiplayer, it will pause for other players to take their turn.  There is an indicator for who the game is waiting on.
					</p>
					<p>
						Use the Join Mission tab to join a friends mission.
						<br />
						Ask them what their mission code is, and make sure they're still in the lobby.  Click the join button to join them!
					</p>
					<p>
						In reprehenderit in voluptate velit esse cillum dolore eu fugiat.
						<br />
						Nulla pariatur excepteur sint occaecat cupidatat non proident.
					</p>
					<p>
						Sunt in culpa qui officia deserunt mollit anim id est laborum.
						<br />
						Pellentesque habitant morbi tristique senectus et netus et malesuada.
					</p>
					<p>
						Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet.
						<br />
						Ante donec eu libero sit amet quam egestas semper aenean ultricies.
					</p>
					<p>
						Mi vitae est. Mauris placerat eleifend leo quisque ut erat.
						<br />
						Curabitur ullamcorper ultricies nisi nam eget dui etiam rhoncus.
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
