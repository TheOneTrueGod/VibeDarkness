<?php

namespace App;

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
        $campaign = new Campaign($id, '', [], [], ['food' => 0, 'metal' => 0, 'population' => 0]);
        $this->persistCampaign($campaign);
        $this->cache[$id] = $campaign;
        return $campaign;
    }

    public function updateCampaign(Campaign $campaign): void
    {
        $this->persistCampaign($campaign);
        $this->cache[$campaign->getId()] = $campaign;
    }

    private function getStoragePath(): string
    {
        $path = dirname(__DIR__) . '/storage/campaigns';
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
        $campaign = Campaign::fromArray($data);
        $this->cache[$id] = $campaign;
        return $campaign;
    }
}
