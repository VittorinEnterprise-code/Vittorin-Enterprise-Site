import {
  AtSign,
  BriefcaseBusiness,
  Camera,
  Globe2,
  Mail,
  MessageCircle,
  Music2,
  PlayCircle,
  Send,
  Users,
} from "lucide-react";
import type { SocialPlatform } from "@/lib/site-content";

type SocialPlatformIconProps = {
  platform: SocialPlatform;
  className?: string;
};

export function SocialPlatformIcon({ platform, className }: SocialPlatformIconProps) {
  const props = { className, "aria-hidden": true as const };

  switch (platform) {
    case "whatsapp":
      return <MessageCircle {...props} />;
    case "instagram":
      return <Camera {...props} />;
    case "youtube":
      return <PlayCircle {...props} />;
    case "facebook":
      return <Users {...props} />;
    case "linkedin":
      return <BriefcaseBusiness {...props} />;
    case "tiktok":
      return <Music2 {...props} />;
    case "telegram":
      return <Send {...props} />;
    case "email":
      return <Mail {...props} />;
    case "website":
      return <Globe2 {...props} />;
    default:
      return <AtSign {...props} />;
  }
}
