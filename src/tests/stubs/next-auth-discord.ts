type DiscordProviderOptions = {
  clientId?: string;
  clientSecret?: string;
  authorization?: {
    params?: {
      scope?: string;
    };
  };
};

export default function DiscordProvider(options: DiscordProviderOptions = {}) {
  return {
    id: "discord",
    name: "Discord",
    type: "oauth",
    options,
  };
}
