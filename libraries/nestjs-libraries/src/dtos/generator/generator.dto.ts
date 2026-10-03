import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// One already-uploaded photo the user attached to the generator. Only `id` is
// trusted — the backend re-resolves the real path from the DB (scoped to the
// org), so a caller cannot smuggle an arbitrary path here.
export class GeneratorMediaDto {
  @IsString()
  id: string;

  @IsString()
  @IsOptional()
  path?: string;
}

export class GeneratorDto {
  @IsString()
  @MinLength(10)
  research: string;

  @IsBoolean()
  isPicture: boolean;

  @IsString()
  @IsIn(['one_short', 'one_long', 'thread_short', 'thread_long'])
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long';

  @IsString()
  @IsIn(['personal', 'company'])
  tone: 'personal' | 'company';

  // Phase 3 (vision): existing photos the user attached. When present (and a
  // vision model is configured) the generator looks at each one and writes the
  // post around what's actually in them, then attaches them to the output.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => GeneratorMediaDto)
  pictures?: GeneratorMediaDto[];
}
