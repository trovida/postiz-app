import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CaptionMediaDto {
  // Id of a media row the caller already uploaded (ownership is checked
  // server-side); never a raw URL, so there is no SSRF surface.
  @IsString()
  @MinLength(1)
  mediaId: string;

  @IsOptional()
  @IsIn(['casual', 'professional', 'funny', 'inspirational', 'promotional'])
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  instructions?: string;

  // The caption-so-far, so the generated caption can match the user's voice.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}
