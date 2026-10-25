<?php

namespace App;

use App\SaveData\CampaignMigrations;
use App\SaveData\MigrationLookups;
use App\SaveData\StorageRoot;

/**
 * Manages campaign storage. One file per campaign at storage/campaigns/<id>.json (O(1) lookup by id).
 */
class CampaignManager
{
    private static ?CampaignManager $instance = null;

    /** @var array<string, Campaign> */
    private array $cache = [];

    private function __construct() {}

    public static function getInstance(): CampaignManager
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getCampaign(string $id): ?Campaign
    {
        if (isset($this->cache[$id])) {
            return $this->cache[$id];
        }
        return $this->loadCampaignFromStorage($id);
    }

    public function createCampaign(string $ownerAccountId): Campaign
    {
        $id = $this->generateCampaignId();
        $campaign = new Campaign($id, '', [], [], Campaign::zeroResources(), [], [], [], [], [], CampaignMigrations::CURRENT_VERSION);
        $this->persistCampaign($campaign);
        $this->cache[$id] = $campaign;
        return $campaign;
    }

    public function updateCampaign(Campaign $campaign): void
    {
        $this->persistCampaign($campaign);
        $this->cache[$campaign->getId()] = $campaign;
    }

    /**
     * Campaign for a character: character -> ownerAccountId -> account campaignIds[0]
     * (campaignCharacters is always empty on disk, so the owner's default campaign is used).
     */
    public function getCampaignForCharacter(string $characterId, ?AccountService $accountService = null): ?Campaign
    {
        $character = CharacterManager::getInstance()->getCharacter($characterId);
        if ($character === null) {
            return null;
        }
        $accountService ??= new AccountService(new \App\Storage\FlatFilePlayerAccountStorage());
        $account = $accountService->getAccountById($character->getOwnerAccountId());
        if ($account === null) {
            return null;
        }
        $campaignIds = $account->getCampaignIds();
        if ($campaignIds === []) {
            return null;
        }
        return $this->getCampaign((string) $campaignIds[0]);
    }

    /**
     * Unlock items on the character's campaign. Persists only when something changed.
     *
     * @param array<int, string> $itemIds
     */
    public function unlockItemsForCharacter(string $characterId, array $itemIds, ?AccountService $accountService = null): void
    {
        if ($itemIds === []) {
            return;
        }
        $campaign = $this->getCampaignForCharacter($characterId, $accountService);
        if ($campaign === null) {
            return;
        }
        if ($campaign->unlockItems($itemIds)) {
            $this->updateCampaign($campaign);
        }
    }

    private function getStoragePath(): string
    {
        $path = StorageRoot::path('campaigns');
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
        return $path;
    }

    private function generateCampaignId(): string
    {
        $path = $this->getStoragePath();
        do {
            $id = strtolower(bin2hex(random_bytes(8)));
        } while (file_exists($path . '/' . $id . '.json'));
        return $id;
    }

    private function persistCampaign(Campaign $campaign): void
    {
        $path = $this->getStoragePath() . '/' . $campaign->getId() . '.json';
        file_put_contents($path, json_encode($campaign->toArray(), JSON_PRETTY_PRINT));
    }

    private function loadCampaignFromStorage(string $id): ?Campaign
    {
        $path = $this->getStoragePath() . '/' . $id . '.json';
        if (!is_file($path)) {
            return null;
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }
        $data['id'] = $id;
        $lookups = new MigrationLookups(StorageRoot::get());
        $migrated = CampaignMigrations::migrate(
            $data,
            static fn (string $cid): array => $lookups->ownerCharacterIds($cid),
            static fn (string $charId): ?array => $lookups->loadCharacter($charId)
        );
        $campaign = Campaign::fromArray($migrated['data']);
        if ($migrated['changed']) {
            $this->persistCampaign($campaign);
        }
        $this->cache[$id] = $campaign;
        return $campaign;
    }
}
